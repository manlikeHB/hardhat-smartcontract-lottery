const { network, ethers } = require("hardhat");
const { developmentChains } = require("../utils/helper-hardhat-config");

const BASE_FEE = ethers.parseEther("0.25");
const Gas_PRICE_LINK = 1e9;

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;
  const chainId = network.config.chainId;

  const args = [BASE_FEE, Gas_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    log("Local network detected! Deploying mocks....");
    await deploy("VRFCoordinatorV2Mock", {
      Contract: "VRFCoordinatorV2Mock",
      from: deployer,
      args: args,
      log: true,
    });
  }

  log("Mocks deployed!");
  log("-----------------------------------------------------");
};

module.exports.tags = ["all", "mocks"];
