require('dotenv').config();
const axios = require('axios');
const ethers = require('ethers');
const readline = require('readline');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`-------------------------------------------------`);
    console.log(`   Euclid Testnet Auto Bot - Airdrop Insiders`);
    console.log(`-------------------------------------------------${colors.reset}`);
    console.log();
  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

const retry = async (fn, retries = 20, baseDelay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      let delay = baseDelay;
      if (error.response?.status === 429) {
        delay = baseDelay * Math.pow(2, Math.min(i, 5)) + Math.random() * 1000;
        logger.warn(`Rate limit hit. Waiting ${Math.round(delay/1000)}s before retry ${i + 1}/${retries}...`);
      } else {
        delay = baseDelay + Math.random() * 2000;
        logger.warn(`API retry ${i + 1}/${retries} failed: ${error.message}. Retrying in ${Math.round(delay/1000)}s...`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const createAxiosInstance = () => {
  return axios.create({
    timeout: 30000,
    headers: {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'accept-language': 'en-US,en;q=0.5',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
      'sec-gpc': '1',
      'Referer': 'https://testnet.euclidswap.io/',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    }
  });
};

const ethersVersion = parseInt(ethers.version.split('.')[0], 10);
const isEthersV6 = ethersVersion >= 6;

const randomDelay = (min = 2000, max = 5000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

async function main() {
  logger.banner();

  try {
    console.log(`${colors.cyan}Menu:${colors.reset}`);
    console.log(`1. ETH - EUCLID (Arbitrum)`);
    console.log(`2. ETH - ANDR (Arbitrum)`);
    console.log(`3. ETH - MON (Arbitrum)`);
    console.log(`4. Random Swap (EUCLID/ANDR/MON)`);
    console.log(`5. Exit`);
    console.log();

    const swapType = await question(
      `${colors.cyan}Enter menu option (1-5): ${colors.reset}`
    );

    if (swapType === '5') {
      logger.info(`Exiting...`);
      rl.close();
      return;
    }

    if (!['1', '2', '3', '4'].includes(swapType)) {
      logger.error(`Invalid menu option. Please enter 1, 2, 3, 4, or 5.`);
      rl.close();
      return;
    }

    const numTransactions = parseInt(
      await question(`${colors.cyan}Enter number of transactions to perform: ${colors.reset}`)
    );
    const ethAmount = parseFloat(
      await question(`${colors.cyan}Enter ETH amount per transaction: ${colors.reset}`)
    );

    if (isNaN(numTransactions) || isNaN(ethAmount) || numTransactions <= 0 || ethAmount <= 0) {
      logger.error(`Invalid input. Please enter positive numbers.`);
      rl.close();
      return;
    }

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      logger.error(`Private key not found in .env file`);
      rl.close();
      return;
    }

    let provider, wallet;
    if (isEthersV6) {
      provider = new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
      wallet = new ethers.Wallet(privateKey, provider);
    } else {
      provider = new ethers.providers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
      wallet = new ethers.Wallet(privateKey, provider);
    }

    const walletAddress = wallet.address;

    logger.info(`Connected to wallet: ${colors.yellow}${walletAddress}`);
    logger.info(`Network: ${colors.yellow}Arbitrum Sepolia (Chain ID: 421614)`);
    console.log();

    const contractAddress = '0x7f2CC9FE79961f628Da671Ac62d1f2896638edd5';

    const balance = await provider.getBalance(walletAddress);
    let requiredEth, gasEstimatePerTx, totalRequiredEth;

    if (isEthersV6) {
      requiredEth = ethers.parseEther(ethAmount.toString()) * BigInt(numTransactions);
      gasEstimatePerTx = ethers.parseEther('0.00009794');
      totalRequiredEth = requiredEth + gasEstimatePerTx * BigInt(numTransactions);
    } else {
      requiredEth = ethers.utils.parseEther((numTransactions * ethAmount).toString());
      gasEstimatePerTx = ethers.utils.parseUnits('0.00009794', 'ether');
      totalRequiredEth = requiredEth.add(gasEstimatePerTx.mul(numTransactions));
    }

    const isBalanceInsufficient = isEthersV6
      ? balance < totalRequiredEth
      : balance.lt(totalRequiredEth);

    if (isBalanceInsufficient) {
      logger.error(
        `Insufficient ETH balance. Required: ${
          isEthersV6 ? ethers.formatEther(totalRequiredEth) : ethers.utils.formatEther(totalRequiredEth)
        } ETH, Available: ${
          isEthersV6 ? ethers.formatEther(balance) : ethers.utils.formatEther(balance)
        } ETH`
      );
      rl.close();
      return;
    }

    logger.warn(`Summary:`);
    logger.step(`Swap type: ${colors.yellow}${
      swapType === '1' ? 'ETH to EUCLID' :
      swapType === '2' ? 'ETH to ANDR' :
      swapType === '3' ? 'ETH to MON' : 'Random (EUCLID/ANDR/MON)'
    }`);
    logger.step(`Number of transactions: ${colors.yellow}${numTransactions}`);
    logger.step(`ETH per transaction: ${colors.yellow}${ethAmount} ETH`);
    logger.step(`Total ETH (incl. gas): ${colors.yellow}${
      isEthersV6 ? ethers.formatEther(totalRequiredEth) : ethers.utils.formatEther(totalRequiredEth)
    } ETH`);
    logger.step(`Retry attempts per API call: ${colors.yellow}20 times with 5s+ delay`);
    console.log();

    const confirm = await question(`${colors.yellow}Continue with these settings? (y/n): ${colors.reset}`);

    if (confirm.toLowerCase() !== 'y') {
      logger.error(`Operation cancelled by user.`);
      rl.close();
      return;
    }

    const axiosInstance = createAxiosInstance();
    
    for (let i = 0; i < numTransactions; i++) {
      let targetToken, targetChainUid, swapRoute, defaultAmountOut, amountOutHops;

      if (swapType === '4') {
        const options = ['euclid', 'andr', 'mon'];
        targetToken = options[Math.floor(Math.random() * options.length)];
      } else {
        targetToken = swapType === '1' ? 'euclid' : swapType === '2' ? 'andr' : 'mon';
      }

      if (targetToken === 'euclid') {
        targetChainUid = 'monad';
        swapRoute = ['eth', 'usdc', 'usdt', 'andr', 'euclid'];
        defaultAmountOut = '338713';
        amountOutHops = [
          `usdc: ${Math.floor(parseInt(defaultAmountOut) * 16.863)}`,
          `usdt: ${Math.floor(parseInt(defaultAmountOut) * 334.61)}`,
          `andr: ${Math.floor(parseInt(defaultAmountOut) * 0.032)}`,
          `euclid: ${defaultAmountOut}`
        ];
      } else if (targetToken === 'andr') {
        targetChainUid = 'andromeda';
        swapRoute = ['eth', 'euclid', 'usdc', 'usdt', 'andr'];
        defaultAmountOut = '1000';
        amountOutHops = [
          `euclid: ${Math.floor(parseInt(defaultAmountOut) * 0.338)}`,
          `usdc: ${Math.floor(parseInt(defaultAmountOut) * 0.057)}`,
          `usdt: ${Math.floor(parseInt(defaultAmountOut) * 1.133)}`,
          `andr: ${defaultAmountOut}`
        ];
      } else {
        targetChainUid = 'monad';
        swapRoute = ['eth', 'sp500', 'usdt', 'euclid', 'mon'];
        defaultAmountOut = '7836729415067468';
        amountOutHops = [
          `sp500: 1150`,
          `usdt: 1090506650`,
          `euclid: 3793949`,
          `mon: ${defaultAmountOut}`
        ];
      }

      logger.loading(`Transaction ${i + 1}/${numTransactions} (ETH to ${targetToken.toUpperCase()}):`);

      try {
        await randomDelay(1000, 3000);
        logger.step(`Fetching swap quote for amount_out...`);

        const gasLimit = 1500000;
        const targetAddress = walletAddress;

        const quotePayload = {
          amount_in: (isEthersV6
            ? ethers.parseEther(ethAmount.toString())
            : ethers.utils.parseEther(ethAmount.toString())).toString(),
          asset_in: {
            token: 'eth',
            token_type: {
              __typename: 'NativeTokenType',
              native: {
                __typename: 'NativeToken',
                denom: 'eth'
              }
            }
          },
          slippage: '500',
          cross_chain_addresses: [
            {
              user: {
                address: targetAddress,
                chain_uid: targetChainUid
              },
              limit: {
                less_than_or_equal: defaultAmountOut
              }
            }
          ],
          partnerFee: {
            partner_fee_bps: 10,
            recipient: '0x8ed341da628fb9f540ab3a4ce4432ee9b4f5d658'
          },
          sender: {
            address: walletAddress,
            chain_uid: 'arbitrum'
          },
          swap_path: {
            path: [
              {
                route: swapRoute,
                dex: 'euclid',
                amount_in: (isEthersV6
                  ? ethers.parseEther(ethAmount.toString())
                  : ethers.utils.parseEther(ethAmount.toString())).toString(),
                amount_out: '0',
                chain_uid: 'vsl',
                amount_out_for_hops: swapRoute.map((token) => `${token}: 0`)
              }
            ],
            total_price_impact: targetToken === 'euclid' ? '29.58' : targetToken === 'mon' ? '34.80' : '29.58'
          }
        };

        const quoteResponse = await retry(() =>
          axiosInstance.post(
            'https://testnet.api.euclidprotocol.com/api/v1/execute/astro/swap',
            quotePayload
          ), 20, 5000
        );

        logger.info(`Quote received`);

        await randomDelay(2000, 4000);

        const amountOut = quoteResponse.data.meta
          ? JSON.parse(quoteResponse.data.meta).swaps.path[0].amount_out
          : defaultAmountOut;
        if (!amountOut || amountOut === '0') {
          logger.error(`Invalid amount_out in API response. Skipping transaction.`);
          continue;
        }

        logger.step(`Building swap transaction...`);

        const swapPayload = {
          amount_in: (isEthersV6
            ? ethers.parseEther(ethAmount.toString())
            : ethers.utils.parseEther(ethAmount.toString())).toString(),
          asset_in: {
            token: 'eth',
            token_type: {
              __typename: 'NativeTokenType',
              native: {
                __typename: 'NativeToken',
                denom: 'eth'
              }
            }
          },
          slippage: '500',
          cross_chain_addresses: [
            {
              user: {
                address: targetAddress,
                chain_uid: targetChainUid
              },
              limit: {
                less_than_or_equal: amountOut
              }
            }
          ],
          partnerFee: {
            partner_fee_bps: 10,
            recipient: '0x8ed341da628fb9f540ab3a4ce4432ee9b4f5d658'
          },
          sender: {
            address: walletAddress,
            chain_uid: 'arbitrum'
          },
          swap_path: {
            path: [
              {
                route: swapRoute,
                dex: 'euclid',
                amount_in: (isEthersV6
                  ? ethers.parseEther(ethAmount.toString())
                  : ethers.utils.parseEther(ethAmount.toString())).toString(),
                amount_out: amountOut,
                chain_uid: 'vsl',
                amount_out_for_hops: amountOutHops
              }
            ],
            total_price_impact: targetToken === 'euclid' ? '29.58' : targetToken === 'mon' ? '34.80' : '29.58'
          }
        };

        const swapResponse = await retry(() =>
          axiosInstance.post(
            'https://testnet.api.euclidprotocol.com/api/v1/execute/astro/swap',
            swapPayload
          ), 20, 5000
        );

        logger.info(`Swap response received`);

        let txData = swapResponse.data.msgs?.[0]?.data;
        if (!txData) {
          logger.error(
            `Calldata not found in API response (expected in msgs[0].data). Please check the API response structure and update the script. Skipping transaction.`
          );
          continue;
        }

        if (swapResponse.data.sender?.address.toLowerCase() !== walletAddress.toLowerCase()) {
          logger.error(
            `API returned incorrect sender address: ${swapResponse.data.sender.address}. Expected: ${walletAddress}. Skipping transaction.`
          );
          continue;
        }

        logger.loading(`Executing swap transaction...`);

        const tx = {
          to: contractAddress,
          value: isEthersV6
            ? ethers.parseEther(ethAmount.toString())
            : ethers.utils.parseEther(ethAmount.toString()),
          data: txData,
          gasLimit: gasLimit,
          nonce: await provider.getTransactionCount(walletAddress, 'pending')
        };

        if (isEthersV6) {
          tx.maxFeePerGas = ethers.parseUnits('0.1', 'gwei');
          tx.maxPriorityFeePerGas = ethers.parseUnits('0.1', 'gwei');
        } else {
          tx.maxFeePerGas = ethers.utils.parseUnits('0.1', 'gwei');
          tx.maxPriorityFeePerGas = ethers.utils.parseUnits('0.1', 'gwei');
        }

        try {
          const gasEstimate = await provider.estimateGas(tx);
          logger.info(`Estimated gas: ${gasEstimate.toString()}`);
          tx.gasLimit = isEthersV6
            ? (gasEstimate * 110n) / 100n
            : gasEstimate.mul(110).div(100);
        } catch (gasError) {
          logger.warn(`Gas estimation failed: ${gasError.message}. Using manual gas limit: ${gasLimit}`);
        }

        try {
          await provider.call(tx);
        } catch (simulationError) {
          logger.error(`Transaction simulation failed: ${simulationError.reason || simulationError.message}`);
          continue;
        }

        const txResponse = await wallet.sendTransaction(tx);
        logger.info(`Transaction sent! Hash: ${colors.yellow}${txResponse.hash}`);

        logger.loading(`Waiting for confirmation...`);
        const receipt = await txResponse.wait();

        if (receipt.status === 1) {
          logger.success(`Transaction successful! Gas used: ${receipt.gasUsed.toString()}`);

          await randomDelay(2000, 4000);

          const metaPayload = {
            asset_in_type: 'native',
            releases: [
              {
                dex: 'euclid',
                release_address: [
                  {
                    chain_uid: targetChainUid,
                    address: walletAddress,
                    amount: amountOut
                  }
                ],
                token: targetToken,
                amount: ''
              }
            ],
            swaps: {
              path: [
                {
                  route: swapRoute,
                  dex: 'euclid',
                  chain_uid: 'vsl',
                  amount_in: (isEthersV6
                    ? ethers.parseEther(ethAmount.toString())
                    : ethers.utils.parseEther(ethAmount.toString())).toString(),
                  amount_out: amountOut
                }
              ]
            }
          };

          await retry(() =>
            axiosInstance.post(
              'https://testnet.api.euclidprotocol.com/api/v1/txn/track/swap',
              {
                chain: 'arbitrum',
                tx_hash: txResponse.hash,
                meta: JSON.stringify(metaPayload)
              }
            ), 20, 5000
          );

          logger.success(`Transaction tracked with Euclid`);

          await retry(() =>
            axiosInstance.post(
              'https://testnet.euclidswap.io/api/intract-track',
              {
                chain_uid: 'arbitrum',
                tx_hash: txResponse.hash,
                wallet_address: walletAddress,
                type: 'swap'
              }
            ), 20, 5000
          );

          logger.success(`Transaction tracked with Intract`);

          logger.step(`View transaction: ${colors.cyan}https://sepolia.arbiscan.io/tx/${txResponse.hash}`);
        } else {
          logger.error(`Transaction failed!`);
        }

        if (i < numTransactions - 1) {
          const delay = 60000 + Math.floor(Math.random() * 30000);
          logger.loading(`Waiting ${Math.round(delay / 1000)} seconds before next transaction...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.error(`Error during transaction: ${error.message}`);
        if (error.reason) {
          logger.error(`Revert reason: ${error.reason}`);
        }
        if (error.response?.status === 429) {
          logger.warn(`Rate limit encountered. Consider increasing delays between transactions.`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      console.log();
    }

    logger.success(`${colors.bold}All transactions completed!`);
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    if (error.response?.status === 429) {
      logger.error(`Rate limiting detected. Try running the script later or reduce transaction frequency.`);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`);
  rl.close();
});
