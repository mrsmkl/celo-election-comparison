import chalk from "chalk";
import { cli } from "cli-ux";

export const table = {
  index: {},
  votes: {},
  score: {},
  name: {},
  address: {},
  groupName: {},
  affiliation: {},
};

import { newKit } from "@celo/contractkit";

async function main() {
  const url = process.env['WEB3'] || "http://localhost:8545"
  const kit = newKit(url);

  const accounts = await kit.contracts.getAccounts();
  const election = await kit.contracts.getElection();
  const validators = await kit.contracts.getValidators();

  const thresholdRatio = await election.electabilityThreshold();
  const total = await election.getTotalVotes();

  const { max } = await election.electableValidators();

  const threshold = thresholdRatio.times(total).shiftedBy(-18).toNumber();

  console.log(`Threshold ${threshold.toFixed()} cGLD, Max validators ${max}`);

  cli.action.start("Running mock election");

  const groups = await election.getEligibleValidatorGroupsVotes();

  const elected = [];

  for (const el of groups) {
    const group = await validators.getValidatorGroup(el.address, false);
    const groupName = await accounts.getName(el.address);
    const votes = el.votes.shiftedBy(-18).toNumber();
    for (let i = 0; i < group.members.length; i++) {
      const member = group.members[i];
      const name = await accounts.getName(member);
      const score =
        (await validators.getValidator(member)).score
          .multipliedBy(100)
          .toFixed(1) + "%";
      elected.push({
        address: member,
        name,
        votes: Math.round(votes / (i + 1)),
        affiliation: el.address,
        groupName,
        score,
      });
    }
  }

  cli.action.stop();

  const sorted = elected.sort((a, b) => b.votes - a.votes);

  cli.table(
    sorted.map((a, i) => ({
      ...a,
      votes:
        a.votes >= threshold
          ? chalk.green(a.votes.toString())
          : chalk.red(a.votes.toString()),
      index:
        i < max.toNumber()
          ? chalk.green((i + 1).toString())
          : chalk.red((i + 1).toString()),
    })),
    table
  );
}

main();
