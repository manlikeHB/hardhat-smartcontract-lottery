const { getNamedAccounts, ethers, deployments, network } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../utils/helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle unit test", function () {
      let vrfCoordinatorV2Mock, raffle, entranceFee, deployer, interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        raffle = await ethers.getContract("Raffle", deployer);
        entranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe("constructor", () => {
        it("Initializes the raffle correctly", async () => {
          const rafflState = await raffle.getRaffleState();

          assert.equal(rafflState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("enterRaffle", () => {
        it("Reverts when you don't pay enough entrance fee", async () => {
          expect(raffle.enterRaffle()).to.be.revertedWith(
            "Raffle__NotEnoughETHEntranceFee"
          );
        });

        it("Does'nt allow entrance when raffle is calculating", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.send("evm_mine", []);

          // we pretend to be a chainlink keeper by calling performUpKeep
          await raffle.performUpkeep("0x");
          expect(raffle.enterRaffle({ value: entranceFee })).to.be.rejectedWith(
            "Raffle__LotteryNotOpen"
          );
        });

        it("Records players when they enter", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          const playerFromContract = await raffle.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });

        it("Should emit event on enter", async () => {
          expect(raffle.enterRaffle({ value: entranceFee })).to.emit(
            "Raffle",
            "RaffleEnter"
          );
        });
      });

      describe("checkUpkeep", () => {
        it("returns false if people have not sent any ETH", async () => {
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.send("evm_mine", []);
          // when you dontwant a function to send transaction, so we use
          // callStatic to simulate a call
          const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x");
          assert(!upkeepNeeded);
        });

        it("return false if enough time has not passed", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) - Math.floor(Number(interval) / 2),
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x");
          assert(!upkeepNeeded);
        });

        it("returns true if enouhgh time has passed, has players, eth and it is open", async () => {
          // has eth
          // has players
          await raffle.enterRaffle({ value: entranceFee });

          // enough time has passed
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.send("evm_mine", []);

          //is open

          const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x");
          assert(upkeepNeeded);
        });
      });

      describe("performUpkeep", () => {
        it("Only runs when upKeepNeeded is true", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.send("evm_mine", []);

          const tx = await raffle.performUpkeep("0x");
          assert(tx);
        });

        it("reverts when upKeepNeeded is false", async () => {
          await expect(
            raffle.performUpkeep("0x")
          ).to.be.revertedWithCustomError(raffle, "Raffle__UpkeepNotNeeded");
        });

        it("updates the raffle state, emits an event and calls the vrf coordinator", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.send("evm_mine", []);

          const txResponse = await raffle.performUpkeep("0x");
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.logs[1].args.requestId;
          const raffleState = await raffle.getRaffleState();

          assert(Number(requestId) > 0);
          assert(Number(raffleState) == 1);
        });
      });

      describe("fulfillRandomWords", () => {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.send("evm_mine", []);
        });

        it("can only be called after performUpkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target)
          ).to.be.revertedWith("nonexistent request");

          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target)
          ).to.be.revertedWith("nonexistent request");
        });

        // ///////////////////////
        it("picks a winner, resets the lottery and sends money", async () => {
          // Add 3 extra accounts to raffle
          const additonalEntrants = 3;
          const startingIndex = 1; // deployer is 0
          const accounts = await ethers.getSigners();

          for (
            let i = startingIndex;
            i < startingIndex + additonalEntrants;
            i++
          ) {
            const accountConnectedRaffle = await raffle.connect(accounts[i]);
            await accountConnectedRaffle.enterRaffle({ value: entranceFee });
          }

          const startingTimeStamp = await raffle.getLatestTimeStamp();

          //performUpkeep (mock being chainlink keepers)
          // fulfillRandomwords (mock being the chainlink VRF)

          // We want to listen for the "WinnerPicked" event that gets emitted when fulfillRandomWords is called
          // by VRF and the lottery is opened, players array is reset and timestamp is reset
          await new Promise(async (resolve, reject) => {
            // Listening gorthe "WinnerPicked" event
            raffle.once("WinnerPicked", async () => {
              // using try catch block incase there is an error so it is rejected
              console.log("Found the Winner!");
              try {
                console.log(accounts[0].address);
                console.log(accounts[1].address);
                console.log(accounts[2].address);
                console.log(accounts[3].address);

                const recentWinner = await raffle.getRecentWinner();
                console.log(recentWinner);
                const raffleState = await raffle.getRaffleState();
                const endingTimeStamp = await raffle.getLatestTimeStamp();
                const numPlayers = await raffle.getNumberOfPlayers();

                //get winner ending balance
                const winnerEndingBalance = await ethers.provider.getBalance(
                  accounts[1].address
                );

                assert.equal(numPlayers.toString(), "0");
                assert.equal(raffleState.toString(), "0");
                assert(startingTimeStamp < endingTimeStamp);
                // check that the winner got the ETH price

                assert.equal(
                  winnerEndingBalance.toString(),
                  (
                    winerStartingBalance +
                    entranceFee * BigInt(additonalEntrants) +
                    entranceFee
                  ).toString()
                );

                resolve();
              } catch (err) {
                reject(err);
              }
            });

            // Mock performUpKeep and mock fulfillRandomWords
            const tx = await raffle.performUpkeep("0x");
            console.log("Four");
            const txReceipt = await tx.wait(1);
            console.log("Five");
            // get winners balance before they win
            const winerStartingBalance = await ethers.provider.getBalance(
              accounts[1].address
            );

            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.logs[1].args.requestId,
              raffle.target
            );
          });
        });
      });
    });
