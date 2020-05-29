import { newKit } from "@celo/contractkit/lib";
import { parseBlockExtraData } from '@celo/utils/lib/istanbul'
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
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

function printBitmap(happy: string, sad: string, n: number, str: string, cur_str: string, info: any = {}) {
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

  let block = parsed.startBlock;
  let endBlock = parsed.endBlock;
  let happy = parsed.happy || '.'
  let sad = parsed.sad || 'X'

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
    const next_block = await kit.web3.eth.getBlock(i+1);
    const bitmap = parseBlockExtraData(next_block.extraData).parentAggregatedSeal.bitmap;
    const binary = bitmap.toString(2);
    const block = await kit.web3.eth.getBlock(i);
    const cur_bitmap = parseBlockExtraData(block.extraData).aggregatedSeal.bitmap;
    const cur_binary = cur_bitmap.toString(2);
    clearCursor();
    console.log(`${i} ${printBitmap(happy, sad, 100, binary, cur_binary)}`);
    cursorStart = `${i} `.length
    showCursor();
  }
  process.exit()
}

main();
