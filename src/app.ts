import { newKit } from '@celo/contractkit'
 
async function main() {

  const kit = newKit('http://localhost:8545')

  const web3 = kit.web3

  const resp = await web3.eth.sendTransaction({from: "0x47e172F6CfB6c7D01C1574fa3E2Be7CC73269D95", value: "123", to: "0x119e514c10517321408477D95692bF479b830252"})

  console.log(resp)
}

main()
