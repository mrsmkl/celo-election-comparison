import { ContractKit, newKit } from "@celo/contractkit/lib";
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import BigNumber from "bignumber.js";
import { cli } from "cli-ux";
import chalk from "chalk";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let exiting = false

process.on('SIGINT', function() {
  if (exiting) process.exit(0)
  console.log("Caught interrupt signal");
  exiting = true
});

export const table = {
  down: {},
  total: {},
  percent: {},
  name: {},
  address: {},
  signer: {},
};
const epochValidators: any = {};
const storeSigners: any = {};

async function getEpochValidators(
  kit: ContractKit,
  block: number,
  epoch: number
) {
  if (epochValidators[epoch] !== undefined) return epochValidators[epoch];

  const election = await kit._web3Contracts.getElection();
  const accounts = await kit._web3Contracts.getAccounts();

  // @ts-ignore
  const signers = await election.methods.getCurrentValidatorSigners().call({}, block);

  const acc = [];
  for (const it of signers) {
    try {
      // @ts-ignore
      let addr = await accounts.methods.signerToAccount(it).call({});
      if (addr === '0x0000000000000000000000000000000000000000') {
        addr = it
      }
      storeSigners[addr] = it;
      acc.push(addr);
    }
    catch (err) {
      storeSigners[it] = it;
      acc.push(it);
    }
  }

  epochValidators[epoch] = acc;

  return acc;
}

function printBitmap(n: number, str: string) {
  while (str.length < n) str = "0" + str;
  let res = "";
  for (let i = 0; i < n; i++) {
    res += str.charAt(i) === "1" ? chalk.green(".") : chalk.red("X");
  }
  return res;
}

async function main() {
  const kit = newKit("http://localhost:8545");

  const options = [
    { name: 'startBlock', type: Number, description: 'Start block. Default: -100' },
    { name: 'endBlock', type: Number, description: 'End block. Default: 10000000000' },
    { name: 'no-addresses', type: Boolean, description: 'Do not show signer addresses' },
    { name: 'help', type: Boolean, description: 'Help message' },
  ];

  const parsed = commandLineArgs(options);
  if (parsed.help) {
    console.log(commandLineUsage([
      {
        header: "celo-signed-blocks",
        content: "Show information Celo block signing",
      },
      {
        header: "Options",
        optionList: options,
      },
      {
        header: "Info",
        content: "Enter ctrl-c to interrupt. Then it will show stats about downtime.",
      }
    ]));
    return
  }

  const slasher = await kit._web3Contracts.getDowntimeSlasher();
  const accounts = await kit.contracts.getAccounts();

  let block = parsed.startBlock;
  let endBlock = parsed.endBlock;
  let showAddresses = !parsed['no-addresses'];

  if (block >= 0 && endBlock) {

    const startEpoch = parseInt(
      await slasher.methods.getEpochNumberOfBlock(block).call(),
      10
    );
    const endEpoch = parseInt(
      await slasher.methods.getEpochNumberOfBlock(endBlock).call(),
      10
    );

    console.log(
      `Starting at block ${block} (epoch ${startEpoch}), ending at ${endBlock} (epoch ${endEpoch})`
    );

  }

  const stats: any = {};

  if (!block || block < 0) {
    const bn = await kit.web3.eth.getBlockNumber()
    block = bn + (block || -100)
    endBlock = endBlock || 10000000000
  }

  for (let i = block; i <= endBlock; i++) {
    let bn = await kit.web3.eth.getBlockNumber();
    while (bn-1 < i && !exiting) {
      await sleep(100)
      bn = await kit.web3.eth.getBlockNumber();
    }
    if (exiting) break;
    const bitmap = new BigNumber(
      // @ts-ignore
      await slasher.methods.getParentSealBitmap(i + 1).call({}, i + 1)
    );
    const binary = bitmap.toString(2);
    const epoch = parseInt(
      await slasher.methods.getEpochNumberOfBlock(i).call(),
      10
    );
    const prevEpoch = parseInt(
      await slasher.methods.getEpochNumberOfBlock(i - 1).call(),
      10
    );
    const validators: string[] = await getEpochValidators(kit, i, epoch);
    let downValidators = 0;
    let downLst : string[] = [];
    validators.map((v, idx) => {
      const down = binary.charAt(binary.length - 1 - idx) === "0";
      stats[v] = stats[v] || { down: 0, total: 0, address: v };
      if (down) downLst.push(v);
      stats[v].down += down ? 1 : 0;
      stats[v].total++;
      downValidators += down ? 1 : 0;
    });
    if (!showAddresses) downLst = [];
    console.log(`${epoch} ${i} ${printBitmap(validators.length, binary)} ${downValidators} down ${downLst} ${epoch !== prevEpoch ? 'EPOCH CHANGE' : ''}`);
  }
  const lst: any[] = await Promise.all(
    Object.values(stats).map(async (a: any) => ({
      ...a,
      percent: a.down / a.total,
      name: await accounts.getName(a.address),
      signer: storeSigners[a.address],
    }))
  );
  const sorted = lst.sort((a, b) => a.percent - b.percent);
  const percentString = (a: number) => Math.round(a * 100) + "%";
  cli.table(
    sorted.map((a) => ({ ...a, percent: percentString(a.percent) })),
    table
  );
}

main();
