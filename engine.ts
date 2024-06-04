
import {
    SystemProgram,
    Transaction,
    PublicKey,
    ComputeBudgetProgram,
    ParsedAccountData,
} from "@solana/web3.js";

import {
    getMint,
    getTransferFeeAmount,
    unpackAccount,
    TOKEN_2022_PROGRAM_ID,
    withdrawWithheldTokensFromAccounts,
    createWithdrawWithheldTokensFromAccountsInstruction,
    transferCheckedWithFee,
    createTransferCheckedWithFeeInstruction,
    burn,
    createBurnInstruction,
    createTransferInstruction,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccountIdempotent,
    getAssociatedTokenAddress,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { 
    Token
} from '@raydium-io/raydium-sdk';

import {
    connection,
    FEE_VAULT,
    INIT_FEE_PERCENTAGE,
    maxFeeTokens,
    POOL_ID,
    TOKEN_MINT,
    TOKEN_DECIMALS,
    payer,
    WALLET,
    withdrawWithheldAuthority,
    withdrawMin,
    MAX_WITHDRAWS,
    DEFAULT_TOKEN,
} from "./config";

import { 
    generateExplorerTxUrl, 
    getTokenBalance, 
    sleep, 
    mySendAndConfirmTransaction 
} from "./utils";
import { 
    getPendingRewards, 
    setRewardTokenAmount, 
    addRewardTokenAmount, 
} from "./backend";


////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

export const withdrawTokens = async () => {
    let withdrawAmount: bigint = BigInt(0);
    let withdrawAccounts = 0;

    try {
        /* Fetch Fee Accounts */
        const tokenHolders = await connection.getProgramAccounts(
            TOKEN_2022_PROGRAM_ID,
            {
                commitment: "confirmed",
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: TOKEN_MINT.toString()
                        }
                    }
                ]
            }
        );
        // console.log("  TokenHolders:", tokenHolders);

        // Extract fee addresses and sum up amount
        const accountsToWithdrawFrom: PublicKey[] = [];

        for (const tokenHolder of tokenHolders) {
            const account = unpackAccount(
                tokenHolder.pubkey,
                tokenHolder.account,
                TOKEN_2022_PROGRAM_ID
            );
            
            const transferFeeAmount = getTransferFeeAmount(account);
            if ((transferFeeAmount !== null && transferFeeAmount.withheldAmount > BigInt(0)) && withdrawAccounts < MAX_WITHDRAWS) {
                accountsToWithdrawFrom.push(tokenHolder.pubkey);
                withdrawAmount += transferFeeAmount.withheldAmount;
                withdrawAccounts++;
                // console.log(`  From ${tokenHolder.pubkey}  withheld ${transferFeeAmount.withheldAmount}`);
            }
        }
        if (withdrawAmount < withdrawMin) {
            return BigInt(0);
        }

        /* Withdraw fees by Authority */
        const feeVaultAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            TOKEN_MINT,
            FEE_VAULT,
            undefined,
            undefined,
            undefined,
            TOKEN_2022_PROGRAM_ID
        );
        // console.log("  Withdraw feeVaultAccount:", feeVaultAccount);

        const transaction = new Transaction().add(
            createWithdrawWithheldTokensFromAccountsInstruction(
                TOKEN_MINT,
                feeVaultAccount.address,
                withdrawWithheldAuthority.publicKey,
                [payer],
                accountsToWithdrawFrom,
                TOKEN_2022_PROGRAM_ID
            )
        );
        const withdrawSig = await mySendAndConfirmTransaction(connection, payer, transaction, {
            skipPreflight: true,
            maxRetries: 0
        });

        console.log("  Withdrew withheld tokens from accounts:", generateExplorerTxUrl(withdrawSig));
    } catch (err) {
        console.error("withdraw error:", err);
        return BigInt(0);
    }

    return withdrawAmount;
}


export const transferTokens = async (destinationWallet: PublicKey, transferAmount: bigint) => {
    // Calculate the fee for the transfer
    const calcFee = (transferAmount * BigInt(INIT_FEE_PERCENTAGE) + BigInt(10_000 - 1)) / BigInt(10_000);    // fee unit: 0.01%
    const fee = calcFee > maxFeeTokens ? maxFeeTokens : calcFee;

    const sourceAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        TOKEN_MINT,
        WALLET.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
    );
    // console.log('  sourceAccount:', sourceAccount.address);

    const destinationAccount = await createAssociatedTokenAccountIdempotent(
        connection,
        payer,
        TOKEN_MINT,
        destinationWallet,
        {
            skipPreflight: true
        },
        TOKEN_2022_PROGRAM_ID
    );
    // console.log('  destinationAccount:', destinationAccount);

    const transaction = new Transaction().add(
        createTransferCheckedWithFeeInstruction(
            sourceAccount.address,
            TOKEN_MINT,
            destinationAccount,
            WALLET.publicKey,
            transferAmount,
            TOKEN_DECIMALS,
            fee,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );
    // console.log('  transaction:', transaction);

    const transferSig = await mySendAndConfirmTransaction(connection, payer, transaction, {
        skipPreflight: true,
        maxRetries: 0
    });

    console.log("  Transferred tokens:", generateExplorerTxUrl(transferSig));
}


export async function burnTokens(amount: bigint) {
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        TOKEN_MINT,
        WALLET.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
    );
    // console.log("  tokenAccount:", tokenAccount);

    // const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
    //     units: 1000000 
    // });
    // const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
    //     microLamports: 1 
    // });
    const recentBlockhash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: payer.publicKey
    })
    // .add(modifyComputeUnits)
    // .add(addPriorityFee)
    .add(
        createBurnInstruction(tokenAccount.address, TOKEN_MINT, WALLET.publicKey, amount, undefined, TOKEN_2022_PROGRAM_ID)
    );
    // const fees = await transaction.getEstimatedFee(connection);
    // console.log(`  Estimated SOL transfer cost: ${fees} lamports`);
    const burnSig = await mySendAndConfirmTransaction(connection, payer, transaction, {
        skipPreflight: true,
        maxRetries: 0
    });

    console.log("  Burnt tokens:", generateExplorerTxUrl(burnSig));
}

export async function burnLP(lpMint: string, amount: bigint) {
    // console.log('lpMint:', lpMint);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        new PublicKey(lpMint),
        WALLET.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
    );
    // console.log("  tokenAccount:", tokenAccount);

    // const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
    //     units: 1000000 
    // });
    // const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
    //     microLamports: 1 
    // });
    const recentBlockhash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: payer.publicKey
    })
    // .add(modifyComputeUnits)
    // .add(addPriorityFee)
    .add(
        createBurnInstruction(tokenAccount.address, new PublicKey(lpMint), WALLET.publicKey, amount, undefined, TOKEN_2022_PROGRAM_ID)
    );
    // const fees = await transaction.getEstimatedFee(connection);
    // console.log(`  Estimated SOL transfer cost: ${fees} lamports`);
    const burnSig = await mySendAndConfirmTransaction(connection, payer, transaction, {
        skipPreflight: true,
        maxRetries: 0
    });

    console.log("  Burnt LP:", generateExplorerTxUrl(burnSig));
}


export const distributeTokens = async () => {
    const space = 0; // on-chain space to allocate (in number of bytes)
    // request the cost (in lamports) to allocate `space` number of bytes on chain
    const balanceForRentExemption = await connection.getMinimumBalanceForRentExemption(space);
    // console.log("balanceForRentExemption:", balanceForRentExemption);
    const createAccountFee = 2039280; // unit: lamports

    try {
        /* Get totalSupply */
        const mintInfo = await getMint(
            connection, 
            TOKEN_MINT, 
            undefined, 
            TOKEN_2022_PROGRAM_ID
        );
        const totalSupply = mintInfo.supply;
        // console.log('  totalSupply:', totalSupply);
        if (totalSupply === BigInt(0))
            return;

        const srcBonkAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            DEFAULT_TOKEN.Bonk.mint,
            WALLET.publicKey
        );
        const srcJupAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            DEFAULT_TOKEN.JUP.mint,
            WALLET.publicKey
        );
        // console.log("  sourceAccount:", sourceAccount);

        /* Fetch pending Rewards */
        const pendingRewards = await getPendingRewards();
        // console.log("  pendingRewards:", pendingRewards);
        
        for (const rewardInfo of pendingRewards) {
            const owner = new PublicKey(rewardInfo.account);
            let minSolAmount;

            try {
                const bonkAccount = await getAssociatedTokenAddressSync(
                    DEFAULT_TOKEN.Bonk.mint,
                    owner,
                );
                minSolAmount = (bonkAccount === undefined) ? (createAccountFee * 2 + balanceForRentExemption + 5000) : (balanceForRentExemption + 5000);
            } catch (err) {
                console.error(`  getAddress: ${err} at ${owner}`);
                await setRewardTokenAmount(rewardInfo.account, 0, 0, 0);
                continue;
            }

            // console.log(`owner: ${rewardInfo.account} minSolAmount: ${minSolAmount}`);

            if (rewardInfo.solAmount < minSolAmount) {
                continue;
            }

            try {
                const destBonkAccount = await getOrCreateAssociatedTokenAccount(
                    connection,
                    payer,
                    DEFAULT_TOKEN.Bonk.mint,
                    owner,
                );
                const destJupAccount = await getOrCreateAssociatedTokenAccount(
                    connection,
                    payer,
                    DEFAULT_TOKEN.JUP.mint,
                    owner,
                );
    
                let transaction = new Transaction()
                    .add(
                        SystemProgram.transfer({
                            fromPubkey: WALLET.publicKey,
                            toPubkey: owner,
                            lamports: Number(rewardInfo.solAmount) - minSolAmount + balanceForRentExemption
                        })
                    )
                    .add(
                        createTransferInstruction(
                            srcBonkAccount.address, 
                            destBonkAccount.address, 
                            WALLET.publicKey, 
                            rewardInfo.bonkAmount
                        )
                    )
                    .add(
                        createTransferInstruction(
                            srcJupAccount.address, 
                            destJupAccount.address, 
                            WALLET.publicKey, 
                            rewardInfo.jupAmount
                        )
                    );
                // console.log(`  Send ${rewardInfo.account}  ${rewardInfo.amount}`);

                const distributeSig = await mySendAndConfirmTransaction(connection, payer, transaction, {
                    skipPreflight: true,
                    maxRetries: 0
                });
                console.log(`  Distributed Tokens: ${generateExplorerTxUrl(distributeSig)}`);
            } catch (err) {
                console.error("individualDistribute error:", err);
            }

            // reset reward state
            await setRewardTokenAmount(rewardInfo.account, 0, 0, 0);
        }
    } catch (err) {
        console.error("distribute error:", err);
        return false;
    }

    return true;
}

export const addPendingAmounts = async (pendingSolAmount: number, pendingBonkAmount: number, pendingJupAmount: number) => {
    try {
        /* Get totalSupply */
        const mintInfo = await getMint(
            connection, 
            TOKEN_MINT, 
            undefined, 
            TOKEN_2022_PROGRAM_ID
        );
        const totalSupply = mintInfo.supply;
        // console.log('  totalSupply:', totalSupply);
        if (totalSupply === BigInt(0))
            return true;

        /* Fetch Token holders */
        const tokenHolders = await connection.getParsedProgramAccounts(
            TOKEN_2022_PROGRAM_ID,
            {
                commitment: "confirmed",
                filters: [
                    {
                        dataSize: 182
                    },
                    {
                        memcmp: {
                            offset: 0,
                            bytes: TOKEN_MINT.toString(),
                        },
                    },
                ],
            }
        );
        // console.log("  Token holders:", tokenHolders);

        for (const accountInfo of tokenHolders) {
            const lamports = accountInfo.account.lamports;
            const accountData = accountInfo.account.data as ParsedAccountData;
            const owner = new PublicKey(accountData.parsed.info.owner);
            const accountBalance = BigInt(accountData.parsed.info.tokenAmount.amount);

            if (!owner.equals(WALLET.publicKey) 
                    && lamports > 0 // to skip pools
                    && accountBalance > BigInt(0)) {
                // console.log(`  address: ${owner}  balance: ${accountBalance}`);

                const solAddend = BigInt(BigInt(pendingSolAmount) * accountBalance) / totalSupply;
                if (solAddend > 0) {
                    const bonkAddend = BigInt(BigInt(pendingBonkAmount) * accountBalance) / totalSupply;
                    const jupAddend = BigInt(BigInt(pendingJupAmount) * accountBalance) / totalSupply;

                    await addRewardTokenAmount(owner.toString(), Number(solAddend), Number(bonkAddend), Number(jupAddend));
                }
            }
        }
    } catch (err) {
        console.error("addPendingAmounts error:", err);
        return false;
    }

    return true;
}
