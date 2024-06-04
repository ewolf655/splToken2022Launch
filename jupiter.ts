
import { Wallet } from '@project-serum/anchor';
import {
    PublicKey, 
    VersionedTransaction,
} from '@solana/web3.js';

import fetch from 'cross-fetch';

import {
    connection,
    WALLET,
    payer,
    SLIPPAGE,
} from './config';
import { 
    generateExplorerTxUrl, 
    mySendTransaction, 
    getTokenBalance, 
} from './utils';


async function jupiter_swap(inputToken: string, amount: number, outputToken: string, slippage: number) {
    const wallet = new Wallet(WALLET);

    // Swapping inputToken to outputToken with inputTokenAmount and slippage
    const quoteResponse = await (
        await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputToken}\
&outputMint=${outputToken}\
&amount=${amount}\
&slippageBps=${slippage}`
        )
    ).json();
    if (quoteResponse.error) {
        console.log('quoteResponse:', quoteResponse);
        return '';
    }

    // get serialized transactions for the swap
    const { swapTransaction } = await (
        await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // quoteResponse from /quote api
                quoteResponse,
                // user public key to be used for the swap
                userPublicKey: wallet.publicKey.toString(),
                // auto wrap and unwrap SOL. default is true
                wrapAndUnwrapSol: true,
                // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in quote API.
                // feeAccount: "fee_account_public_key"
                dynamicComputeUnitLimit: true,  // allow dynamic compute limit instead of max 1,400,000
                // custom priority fee
                prioritizationFeeLamports: 'auto'   // or custom lamports: 1000
            })
        })
    ).json();
    // console.log('swapTransaction:', swapTransaction);

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    // console.log('transaction:', transaction);

    const swapSig = await mySendTransaction(connection, transaction, [payer], {
        skipPreflight: true,
        maxRetries: 0
    });
    
    // // sign the transaction
    // transaction.sign([wallet.payer]);

    // // Execute the transaction
    // const rawTransaction = transaction.serialize();
    // const swapSig = await connection.sendRawTransaction(rawTransaction, {
    //     skipPreflight: true,
    //     maxRetries: 2
    // });

    await connection.confirmTransaction(swapSig);

    return swapSig;
}


export async function jupiterSwap(inputToken: PublicKey, amount: number, outputToken: PublicKey) {
    const slippage = SLIPPAGE;
    let oldTokenBalance = BigInt(0);
    let newTokenBalance = BigInt(0);

    oldTokenBalance = await getTokenBalance(outputToken);
    console.log("  oldTokenBalance:", oldTokenBalance);

    const txid = await jupiter_swap(
        inputToken.toString(),
        amount,
        outputToken.toString(),
        slippage
    );
    if (txid === '') {
        return BigInt(0);
    }
    console.log("  Swapped tokens:", generateExplorerTxUrl(txid));

    newTokenBalance = await getTokenBalance(outputToken);

    const newTokenAmount = newTokenBalance - oldTokenBalance;
    console.log("  newTokenAmount:", newTokenAmount);
    return newTokenAmount;
}
