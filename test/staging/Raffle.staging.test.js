const { getNamedAccounts, ethers, deployments, network } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../utils/helper-hardhat-config");
const { assert, expect } = require("chai");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle unit test", function () {
      let raffle, deployer;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        raffle = await ethers.getContract("Raffle", deployer);
        entranceFee = await raffle.getEntranceFee();
      });

      describe("fulfillRandomWords", () => {
        it("works with live chainlink keepers and chainlink vrf, we get a randomwinner", async () => {
          //get latestTimestamp
          const startingTime = await raffle.getLatestTimeStamp();
          const accounts = await ethers.getSigners();

          // we just need to enter the raffle, but we should set a listner before that because we don't know how long it will take for the block to be mined. So even if it is very fast, a listner will be waiting for the event to be emmiteed

          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired!");
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const winnerEndingBalance = await ethers.provider.getBalance(
                  accounts[0]
                );
                const endingTime = await raffle.getLatestTimeStamp();

                await expect(raffle.getPlayer[0]).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(raffleState, 0);
                assert.equal(
                  winnerEndingBalance.toString(),
                  (winnerStartingBalance + entranceFee).toString()
                );
                assert(endingTime > startingTime);

                resolve();
              } catch (err) {
                reject(err);
              }
            });

            await raffle.enterRaffle({ value: entranceFee });
            const winnerStartingBalance = await accounts[0].getBalance();
          });
        });
      });
    });
