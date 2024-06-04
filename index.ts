
import { 
    Token, 
} from '@raydium-io/raydium-sdk';

import Decimal from 'decimal.js';
import * as fs from "fs";

import { 
    isMainNet, 
    TOKEN_MINT, 
    DEFAULT_TOKEN, 
    DEV_WALLET, 
    DISTRIBUTE_PERIOD, 
    INIT_FEE_PERCENTAGE, 
    DEV_PERCENT, 
    BURN_PERCENT, 
    REWARD_SOL_PERCENT, 
    REWARD_BONK_PERCENT, 
    REWARD_JUP_PERCENT, 
    STATS_FILE, 
} from "./config";
import { createToken } from "./create";
import { 
    transferTokens, 
    withdrawTokens, 
    burnTokens, 
    burnLP, 
    distributeTokens, 
    addPendingAmounts, 
} from "./engine";
import { jupiterSwap } from "./jupiter";
import { sleep } from "./utils";


interface CurrentStat {
    devAmount: number;
    burnAmount: number;
    rewardToSolAmount: number;
    rewardToBonkAmount: number;
    rewardToJupAmount: number;
    pendingSolAmount: number;
    pendingBonkAmount: number;
    pendingJupAmount: number;
}


const main = async () => {
    let curStat: CurrentStat;

    // const tokenMint = await createToken();
    // return;

    // await createPool(/* tokenMint */ TOKEN_MINT, new Decimal(0.0000005));
    // return;
    // await createPosition(new Decimal(2000000), new Decimal(0.00000025), new Decimal(0.00000075));
    // return;

    // burn LP
    // await burnLP('PQvkS6vJtt5rn1WuqdjtxUZMW1294dXPy1JnrxQ4hri', BigInt(1000000000));
    // return;

    // transfer occurs...

    const data = fs.readFileSync(STATS_FILE, 'utf-8');
    curStat = JSON.parse(data);
    console.log("curStat:", curStat);

    let needDistribute = true;

    while (true) {
        try {
            console.log("================================================================================");
            console.log("currentStat:", curStat);

            // Withdraw tokens
            console.log("Withdrawing withheld tokens...");
            const withdrawnAmount = await withdrawTokens();
            console.log("  withdrawnAmount:", withdrawnAmount);
            if (withdrawnAmount > 0) {
                curStat.devAmount += Math.floor(Number(withdrawnAmount) * DEV_PERCENT / INIT_FEE_PERCENTAGE);
                curStat.burnAmount += Math.floor(Number(withdrawnAmount) * BURN_PERCENT / INIT_FEE_PERCENTAGE);
                curStat.rewardToSolAmount += Math.floor(Number(withdrawnAmount) * REWARD_SOL_PERCENT / INIT_FEE_PERCENTAGE);
                curStat.rewardToBonkAmount += Math.floor(Number(withdrawnAmount) * REWARD_BONK_PERCENT / INIT_FEE_PERCENTAGE);
                curStat.rewardToJupAmount += Math.floor(Number(withdrawnAmount) * REWARD_JUP_PERCENT / INIT_FEE_PERCENTAGE);
            }

            // Transfer tokens to dev wallet
            if (curStat.devAmount > 0) {
                console.log("Transferring tokens...");
                await transferTokens(DEV_WALLET, BigInt(curStat.devAmount));
                curStat.devAmount = 0;
            }
            
            // Burn tokens
            if (curStat.burnAmount > 0) {
                console.log("Burning tokens...");
                await burnTokens(BigInt(curStat.burnAmount));
                curStat.burnAmount = 0;
            }

            /* Rewards */
            // Reward tokens
            if (needDistribute) {
                console.log("Distributing tokens...");
                
                if (await distributeTokens()) {
                    needDistribute = false;
                }
            }

            // Swap tokens
            if (curStat.rewardToSolAmount) {
                console.log("Swapping tokens...");
                
                const newSolAmount = await jupiterSwap(TOKEN_MINT, curStat.rewardToSolAmount, Token.WSOL.mint);
                if (newSolAmount > 0) {
                    curStat.pendingSolAmount = Number(newSolAmount);
                    curStat.rewardToSolAmount = 0;
                }
            
                const newBonkAmount = await jupiterSwap(TOKEN_MINT, curStat.rewardToBonkAmount, DEFAULT_TOKEN.Bonk.mint);
                if (newBonkAmount > 0) {
                    curStat.pendingBonkAmount = Number(newBonkAmount);
                    curStat.rewardToBonkAmount = 0;
                }
            
                const newJupAmount = await jupiterSwap(TOKEN_MINT, curStat.rewardToJupAmount, DEFAULT_TOKEN.JUP.mint);
                if (newJupAmount > 0) {
                    curStat.pendingJupAmount = Number(newJupAmount);
                    curStat.rewardToJupAmount = 0;
                }
            }

            // Prepare rewards
            if (curStat.pendingSolAmount > 0) {
                console.log("Preparing rewards...");
                
                await addPendingAmounts(curStat.pendingSolAmount, curStat.pendingBonkAmount, curStat.pendingJupAmount);

                curStat.pendingSolAmount = 0;
                curStat.pendingBonkAmount = 0;
                curStat.pendingJupAmount = 0;

                needDistribute = true;
            }

            
            // // DevNet - Reward MTT
            // console.log("Swapping tokens to MTT...");
            // const newMttAmount = await jupiterSwap(TOKEN_MINT.toString(), curStat.rewardToBonkAmount + curStat.rewardToJupAmount, DEFAULT_TOKEN.MTT.toString());
            // if (newMttAmount > 0) {
            //     curStat.distribMttAmount += Number(newMttAmount);
            //     curStat.rewardToBonkAmount = 0;
            //     curStat.rewardToJupAmount = 0;
            // }
            // if (curStat.distribMttAmount) {
            //     console.log("Distributing MTT...");
            //     await distributeTokens(DEFAULT_TOKEN.MTT, BigInt(curStat.distribMttAmount));
            //     curStat.distribMttAmount = 0;
            // }
        } catch (err) {
            console.error(err);
        }

        fs.writeFileSync(STATS_FILE, JSON.stringify(curStat));

        if (!needDistribute)
            await sleep(DISTRIBUTE_PERIOD);
    }
}

main();
