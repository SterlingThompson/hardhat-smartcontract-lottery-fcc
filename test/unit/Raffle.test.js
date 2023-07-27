 const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
 const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
 const { assert, expect } = require("chai")

 !developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval, subscriptionId
        const chainId = network.config.chainId

        beforeEach(async function(){
            deployer = (await getNamedAccounts()).deployer

            //the ["all"] in the parenthesis of the fixture method references
            //'all' in the arrays assigned to the modules.exports.tags
            //object in the deploy scripts
            
            //This line uses the deployments object to deploy 'all' of the
            //scripts in the deploy folder
            await deployments.fixture(["all"])

            raffle = await ethers.getContract("Raffle", deployer)
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            raffleEntranceFee = await raffle.getEntranceFee()
            interval = await raffle.getInterval()
            subscriptionId = networkConfig[chainId]["subscriptionId"]

            //await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
        })

        describe("constructor", function(){
            it("initialize the raffle correctly", async function(){
                //ideally we make our tests have just 1 assert per "it"
                const raffleState = await raffle.getRaffleState()
                //const interval = await raffle.getInterval()            

                assert.equal(raffleState.toString(), 0)
                assert.equal(interval.toString(), networkConfig[chainId]["interval"])
            })
        })  
        
        describe("enterRaffle", function() {
            it("reverts when you don't pay enough", async function(){
                await expect(raffle.enterRaffle()).to.be.revertedWith(
                    "Raffle__NotEnoughETHEntered"
                )
            })

            it("records players when they enter", async function(){
                //Raffle entrance fee needed
                await raffle.enterRaffle({ value: raffleEntranceFee })

                const playerFromContract = await raffle.getPlayer(0)
                assert.equal(playerFromContract, deployer)
            })

            it("emits an event on enter", async function(){
                await expect(raffle.enterRaffle( { value: raffleEntranceFee}))
                             .to.emit(raffle, "RaffleEnter")
            })

            it("doesn't allow entrance when raffle is calculating", async function(){
                await raffle.enterRaffle( { value: raffleEntranceFee })

                //increase time on blockchain by the set interval to trigger raffle.checkUpkeep
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                //mine another block to move forward
                await network.provider.send("evm_mine", [])

                //performUpkeep changes state of the raffle contract from OPEN
                //to CALCULATING
                await raffle.performUpkeep([])

                await expect(raffle.enterRaffle({ value: raffleEntranceFee }))
                            .to.be.revertedWith("Raffle__NotOpen")
            })
        })

        describe("checkUpkeep", function(){
            it("returns false if people haven't sent any ETH", async function(){
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])

                // 'callStatic' allows the checkupKeep method to be called w/o triggering a
                // transaction.

                // the checkUpkeep method triggers a transaction because it is a public
                // function w/o the view keyword which all trigger transactions
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                //check that upKeepNeeded is equal to false
                console.log(upkeepNeeded)
                assert(!upkeepNeeded)
            })

            it("returns false if raffle isn't open", async function(){
                await raffle.enterRaffle( { value: raffleEntranceFee})

                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])

                await raffle.performUpkeep([])
                const raffleState = await raffle.getRaffleState()

                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                assert.equal(raffleState.toString(), "1")

                console.log(upkeepNeeded)
                assert.equal(upkeepNeeded, false)

            })

            it("returns false if enough time hasn't passed", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(!upkeepNeeded)
            })
            it("returns true if enough time has passed, has players, eth, and is open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(upkeepNeeded)
            })            

            
        })

        describe("performUpkeep", function(){

            it("it can only run if checkUpkeep is true", async function(){
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const tx = await raffle.performUpkeep([])

                // checks that method executes. performUpkeep() would not execute
                // if upKeepNeeded equal to false
                assert(tx)
            })

            it("reverts when checkUpkeep is false", async function(){
                await expect(raffle.performUpkeep([]))
                    .to.be.revertedWith("Raffle__UpkeepNotNeeded")
            })

            it("updates the raffle state, emits an event, and calls the vrf coordinator", async function() {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                
                const txResponse = await raffle.performUpkeep([])
                const txReceipt = await txResponse.wait(1)

                const requestId = txReceipt.events[1].args.requestId
                const raffleState = await raffle.getRaffleState()                

                assert(requestId.toNumber() > 0)
                assert(raffleState.toString() == "1")
            })
        })

        describe("fulfillRandomWords", function(){
            beforeEach(async function(){
                await raffle.enterRaffle( { value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])                                
            })
            
            it("can only be called after performUpkeep", async function(){
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address))
                            .to.be.revertedWith("nonexistent request")

                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address))
                            .to.be.revertedWith("nonexistent request") 
                            
                // 'nonexistent request' is the name of an error function that is found in
                // the actual VRFCoordinatorV2Mock from chainlink

                //Refer to https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.8/mocks/VRFCoordinatorV2Mock.sol
                // fulfillRandWordsWithOverride() method
            })

            // In video Patrick mentioned that generally a single it method would
            // not test all of the processes below and that he is just doing it
            // for the sake of the training video

            it("picks a winner, resets the lottery, and sends money", async function(){
                const additionalEntrants = 3
                const startingAccountIndex = 1 
                const accounts = await ethers.getSigners()

                // For loop below takes four different accounts and adds/connects them to the 
                // raffle

                for(let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++){
                    
                    const accountConnectedRaffle = raffle.connect(accounts[i])
                    await accountConnectedRaffle.enterRaffle( { value: raffleEntranceFee})

                }

                const startingTimeStamp = await raffle.getLatestTimestamp();

                // To properly execute test 3 things need to happen:

                // performUpkeep - fulfillRandomWords (after which we could test everything in the it() above)
                //  But if on test net we'd have to wait for fulfillRandomWords to be
                // called.
                
                // On the hardhat localnetwork we don't have to wait but we will simulate
                // So we'll set up a listener to wait for the FulfillRandom words
                // event to be called (WinnerPicked())

                await new Promise(async (resolve, reject) => {

                    raffle.once("WinnerPicked", async () => {

                        console.log("Found the event!")

                        try{
                            
                            const recentWinner = await raffle.getRecentWinner()

                            //We used logging below to find out who the winner would be

                            // console.log(recentWinner)
                            // console.log(accounts[0].address)
                            // console.log(accounts[1].address)
                            // console.log(accounts[2].address)
                            // console.log(accounts[3].address)

                            const raffleState = await raffle.getRaffleState()
                            const endingTimeStamp = await raffle.getLatestTimestamp()

                            const numPlayers = await raffle.getNumberOfPlayers()
                            const winnerEndingBalance = await accounts[1].getBalance()
                            assert.equal(numPlayers.toString(), 0)
                            assert.equal(raffleState.toString(), 0)
                            assert(endingTimeStamp > startingTimeStamp)

                            assert.equal(winnerEndingBalance.toString(), 
                                        winnerStartingBalance
                                        .add(raffleEntranceFee.mul(additionalEntrants)
                                        .add(raffleEntranceFee).toString()))
                        }catch(e){
                            reject(e)
                        }
                        resolve()
                    })

                    const tx = await raffle.performUpkeep([])
                    const txReceipt = await tx.wait(1)
                    const winnerStartingBalance = await accounts[1].getBalance() 
                    await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId,
                                                                  raffle.address)

                })

            })
        })
    })