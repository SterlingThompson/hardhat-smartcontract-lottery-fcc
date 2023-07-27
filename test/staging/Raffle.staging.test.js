const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { assert, expect } = require("chai")

// if developmentChains includes the network.name then
// skip performing tests because it means I'm testing on
// the local network

// Otherwise perform test.
developmentChains.includes(network.name)
   ? describe.skip
   : describe("Raffle Staging Tests", function () {
       let raffle, raffleEntranceFee, deployer

       beforeEach(async function(){
           deployer = (await getNamedAccounts()).deployer

           //the ["all"] in the parenthesis of the fixture method references
           //'all' in the arrays assigned to the modules.exports.tags
           //object in the deploy scripts
           
           //This line uses the deployments object to deploy 'all' of the
           //scripts in the deploy folder
           //await deployments.fixture(["all"])

           raffle = await ethers.getContract("SterlingRaffle", deployer)           
           raffleEntranceFee = await raffle.getEntranceFee()
           
       })

       describe("fulfillRandomWords", function () {
            it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function(){
                // enter the raffle
                const startingTimestamp = await raffle.getLatestTimestamp()
                const accounts = await ethers.getSigners()
                // Will set up listener before entering the raffle just in case
                // the blockchain executes faster than expected

                // THE LISTENER
                await new Promise(async(resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event fired!")

                        try{
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const winnerEndingBalance = await accounts[0].getBalance()
                            const endingTimestamp = await raffle.getLatestTimestamp()

                            // check if players array has been reset
                            await expect(raffle.getPlayer(0)).to.be.reverted
                            assert.equal(recentWinner.toString(), accounts[0].address)
                            assert.equal(raffleState, 0)
                            assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(raffleEntranceFee).toString())
                            assert(endingTimestamp > startingTimestamp)

                            resolve()
                        }catch(e){
                            console.log(e)
                            reject(e)
                        }
                    })

                    const tx = await raffle.enterRaffle( { value: raffleEntranceFee })
                    await tx.wait(1)
                    const winnerStartingBalance = await accounts[0].getBalance()
                })
            })
       })

    })