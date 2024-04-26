const { network, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../utils/helper-hardhat-config");
const { verify } = require("../utils/verify");

const VRF_SUB_FUND_AMOUNT = ethers.parseEther("2");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  let vrfCoordinatorV2Address;
  let subscriptionId;

  if (developmentChains.includes(network.name)) {
    // const vrfCoordinatorV2Mock = await deployments.get("VRFCoordinatorV2Mock");
    const contractAddress = (await deployments.get("VRFCoordinatorV2Mock"))
      .address;
    const vrfCoordinatorV2Mock = await ethers.getContractAt(
      "VRFCoordinatorV2Mock",
      contractAddress
    );
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.target;
    const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
    const transactionReceipt = await transactionResponse.wait(1);
    // subscriptionId = transactionReceipt.events[0].args.subId;
    subscriptionId = 1;
    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      VRF_SUB_FUND_AMOUNT
    );
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
  }

  const entrancFee = networkConfig[chainId]["entrancFee"];
  const gasLane = networkConfig[chainId]["gasLane"];
  const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
  const interval = networkConfig[chainId]["interval"];

  const args = [
    vrfCoordinatorV2Address,
    entrancFee,
    gasLane,
    subscriptionId,
    callbackGasLimit,
    interval,
  ];

  const raffle = await deploy("Raffle", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  // Ensure the Raffle contract is a valid consumer of the VRFCoordinatorV2Mock contract.
  if (developmentChains.includes(network.name)) {
    log(`Adding Consumer...`);
    const vrfCoordinatorV2Mock = await ethers.getContract(
      "VRFCoordinatorV2Mock"
    );
    await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address);
    log(`Consumer Successfully Added!`);
  }
  // Checking If Deployed Raffle Is Added To Consumer List...
  // Adding Raffle Contract To Consumer List If It Is Not...
  // else {
  //   const getConsumers = await vrfCoordinatorV2.getSubscription(subscriptionId);
  //   const { 0: balance, 1: reqCount, 2: owner, 3: consumers } = getConsumers;
  //   log(`Consumers: ${consumers}`);
  //   if (!consumers.includes(raffle.address)) {
  //     log(`Adding Consumer...`);
  //     const addConsumerTxResponse = await vrfCoordinatorV2.addConsumer(
  //       subscriptionId,
  //       raffle.address
  //     );
  //     await addConsumerTxResponse.wait();
  //     const getConsumer =
  //       await vrfCoordinatorV2.getSubscription(subscriptionId);
  //     const { 0: balance, 1: reqCount, 2: owner, 3: consumer } = getConsumer;
  //     log(`Consumer Successfully Added! Consumers: ${consumer}`);
  //   }
  // }

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying....");
    await verify(raffle.address, args);
  }

  log("------------------------------------------------------------------");
};

module.exports.tags = ["all", "raffle"];
