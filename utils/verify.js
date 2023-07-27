const { run } = require("hardhat");

async function verify(contractAddress, args){
    console.log("Verifying contract...");
  
    try{
      //This is the programmatic way to run: npx hardhat verify --network mainnet DEPLOYED_CONTRACT_ADDRESS "Constructor argument 1"
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: args,
      });
    } catch(e){
      if(e.message.toLowerCase().includes("already verified")){
        console.log("Already verified");
      }else{
        console.log(e);
      }
    }
  }

  module.exports = { verify };