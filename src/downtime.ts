import { ContractKit, newKit } from "@celo/contractkit/lib";
import { parseBlockExtraData } from '@celo/utils/lib/istanbul'
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import BigNumber from "bignumber.js";
import { cli } from "cli-ux";
import chalk from "chalk";

var keypress = require('keypress');

// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

let cursor = 100000000
let lineValidators: string[] = []
let cursorStart = 10

let printName = async (a:string) => a

async function showCursor() {
  process.stdout.cursorTo(200);
  process.stdout.clearLine(-1);
  process.stdout.cursorTo(0);
  let res = ''
  if (lineValidators.length == 0) {
    return
  }
  let n = cursor % lineValidators.length
  while (res.length < n + cursorStart + 3) res = ' ' + res
  process.stdout.write(res + await printName(lineValidators[n]));
  process.stdout.cursorTo(n+cursorStart);
}

function clearCursor() {
  process.stdout.cursorTo(200);
  process.stdout.clearLine(-1);
  process.stdout.cursorTo(0);
}

// listen for the "keypress" event
process.stdin.on('keypress', function (_ch, key) {
  if (key && key.name === 'left') {
    cursor--
  }
  if (key && key.name === 'right') {
    cursor++
  }
  showCursor()
  if (key && key.ctrl && key.name == 'c') {
    if (exiting) process.exit(0)
    console.log("Caught interrupt signal");
    exiting = true
    process.stdin.pause();
  }
});

process.stdin.setRawMode(true);
process.stdin.resume();

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

function printBitmap(happy: string, sad: string, n: number, str: string, cur_str: string, info: any) {
  while (str.length < n) str = "0" + str;
  let res = "";
  for (let i = 0; i < n; i++) {
    if (info[i] > 12) {
      res += chalk.bgRed(sad);
    } else if (str.charAt(i) === "0" && info[i] === -1) {
      res += chalk.red("o");
    } else if (str.charAt(i) === "0" && info[i] === -1) {
      res += chalk.red("o");
    } else if (cur_str.charAt(i) === "0" && info[i] === -1) {
      res += chalk.yellow("o");
    } else if (str.charAt(i) === "0") {
      res += chalk.red(sad);
    } else if (cur_str.charAt(i) === "0") {
      res += chalk.yellow(",");
    } else if (info[i] === -1) {
      res += chalk.green("o");
    } else {
      res += chalk.green(happy);
    }
  }
  return res;
}

async function main() {
  const url = process.env['WEB3'] || "http://localhost:8545"
  const kit = newKit(url);

  const options = [
    { name: 'sad', type: String, description: 'Indicator for downtime. Default: X' },
    { name: 'happy', type: String, description: 'Indicator for uptime. Default: .' },
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

  printName = async (a:string) => await accounts.getName(a) || a

  let block = parsed.startBlock;
  let endBlock = parsed.endBlock;
  let showAddresses = !parsed['no-addresses'];
  let happy = parsed.happy || '.'
  let sad = parsed.sad || 'X'

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
    const block = await kit.web3.eth.getBlock(i);
    const block_miner = block.miner;
    const cur_bitmap = parseBlockExtraData(block.extraData).aggregatedSeal.bitmap;
    const cur_binary = cur_bitmap.toString(2);
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
    let downLst : [string,number][] = [];
    let info: any = {}
    validators.map((v, idx) => {
      const down = binary.charAt(binary.length - 1 - idx) === "0";
      stats[v] = stats[v] || { down: 0, total: 0, address: v, window: 0 };
      if (down) {
        stats[v].window++
        info[binary.length - 1 - idx] = stats[v].window
        downLst.push([v, stats[v].window]);
      }
      else {
        stats[v].window = 0
      }
      if (block_miner === storeSigners[v]) {
        info[binary.length - 1 - idx] = -1
      }
      stats[v].down += down ? 1 : 0;
      stats[v].total++;
      downValidators += down ? 1 : 0;
    });
    if (!showAddresses) downLst = [];
    const getName = async ([a,w] : [string,number]) => {
      const res = await accounts.getName(a) || a
      return res + (w>1 ? `{${w}}` : '')
    }
    const viewLst = await Promise.all(downLst.map(getName))
    clearCursor();
    console.log(`${epoch} ${i} ${printBitmap(happy, sad, validators.length, binary, cur_binary, info)} ${downValidators} down ${viewLst} ${epoch !== prevEpoch ? 'EPOCH CHANGE' : ''}`);
    cursorStart = `${epoch} ${i} `.length
    lineValidators = [...validators].reverse()
    showCursor();
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
