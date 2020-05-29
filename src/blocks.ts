import { newKit } from "@celo/contractkit/lib";
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";


function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let exiting = false

process.on('SIGINT', function() {
  if (exiting) process.exit(0)
  console.log("Caught interrupt signal");
  exiting = true
});

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

  let block = parsed.startBlock;
  let endBlock = parsed.endBlock;

  if (block >= 0 && endBlock) {

    console.log(
      `Starting at block ${block}, ending at ${endBlock}`
    );

  }

  if (!block || block < 0) {
    const bn = await kit.web3.eth.getBlockNumber()
    console.log("bn", bn)
    block = bn + (block || -100)
    endBlock = endBlock || 10000000000
  }

  for (let i = block; i <= endBlock; i++) {
    let bn = await kit.web3.eth.getBlockNumber();
    while (bn < i && !exiting) {
      await sleep(100)
      bn = await kit.web3.eth.getBlockNumber();
    }
    if (exiting) break;

    console.log("get block", i)
    const last_block = await kit.web3.eth.getBlock(i-1);
    const block = await kit.web3.eth.getBlock(i);
    const block_miner = block.miner;
    console.log("Miner", block_miner, "Time", block.timestamp, "Diff", parseInt(block.timestamp as any,10) - parseInt(last_block.timestamp as any,10))
  }
  process.exit()
}

main();
