import { 
    Connection, 
    Keypair, 
    PublicKey, 
    clusterApiUrl, 
} from "@solana/web3.js";

import { 
    Token, 
    TxVersion, 
    TOKEN_PROGRAM_ID, 
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID, 
    LOOKUP_TABLE_CACHE,
} from "@raydium-io/raydium-sdk";

import bs58 from "bs58";
import dotenv from "dotenv";


dotenv.config();

export const isMainNet = process.env.IS_DEVNET === "false";

export const TOKEN_NAME = process.env.TOKEN_NAME || "";
export const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "";
export const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 9);      /* default: 9 */
export const TOTAL_SUPPLY = Number(process.env.TOTAL_SUPPLY || 1000000);    /* default: 1 million tokens */
export const TOKEN_DESCRIPTION = process.env.TOKEN_DESCRIPTION || "";
export const TOKEN_IMG_NAME = process.env.TOKEN_IMG_NAME || "logo.png";

export const INIT_FEE_PERCENTAGE = Number(process.env.INIT_FEE_PERCENTAGE || 600);
export const MAX_FEE_TOKENS = Number(process.env.MAX_FEE_TOKENS || 100000);         /* default: 100,000 tokens */
export const WITHDRAW_MIN = Number(process.env.WITHDRAW_MIN || 10000);              /* default: 10,000 tokens */

export const DISTRIBUTE_PERIOD = Number(process.env.DISTRIBUTE_PERIOD || 60000);    /* default: 1 min */
export const DEV_PERCENT = Number(process.env.DEV_PERCENT || 400);                  /* default: 4% */
export const BURN_PERCENT = Number(process.env.BURN_PERCENT || 50);                 /* default: 0.5% */
export const REWARD_SOL_PERCENT = Number(process.env.REWARD_SOL_PERCENT || 50);     /* default: 0.5% */
export const REWARD_BONK_PERCENT = Number(process.env.REWARD_BONK_PERCENT || 50);   /* default: 0.5% */
export const REWARD_JUP_PERCENT = Number(process.env.REWARD_JUP_PERCENT || 50);     /* default: 0.5% */
export const SLIPPAGE = Number(process.env.SLIPPAGE || 1500);                       /* default: 15% */

export const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT || "");
export const POOL_ID = new PublicKey(process.env.POOL_ID || "");

export const OWNER_PRIV_KEY = process.env.OWNER_PRIV_KEY || "";
export const FEE_VAULT = new PublicKey(process.env.FEE_VAULT || "");
export const DEV_WALLET = new PublicKey(process.env.DEV_WALLET || "");


export const PROGRAMIDS = isMainNet ? MAINNET_PROGRAM_ID : DEVNET_PROGRAM_ID;
export const NETWORK = isMainNet ? "mainnet-beta" : "devnet";
export const addLookupTableInfo = isMainNet ? LOOKUP_TABLE_CACHE : undefined;
export const TOKEN_IMG_PATH = `assets/${TOKEN_IMG_NAME}`;

export const networkUrl = /* clusterApiUrl(NETWORK) */
    /* 'https://solana-api.projectserum.com/' */ 
    /* 'https://solana-mainnet.g.alchemy.com/v2/j_0irTskpyfvy2WtK09VvhamD6IQWQjO' */
    /* 'https://mainnet.helius-rpc.com/?api-key=9a24f0cb-ba18-441e-9352-487b50301544' */    // From Client
    'https://mainnet.helius-rpc.com/?api-key=e0762009-5522-4263-a855-b8fc58a53dc9';
console.log('NetworkUrl:', networkUrl);
export const connection = new Connection(networkUrl, "confirmed");

export const maxFeeTokens = BigInt(MAX_FEE_TOKENS * Math.pow(10, TOKEN_DECIMALS));
export const withdrawMin = BigInt(BigInt(WITHDRAW_MIN) * BigInt(Math.pow(10, TOKEN_DECIMALS)));

export const WALLET = Keypair.fromSecretKey(bs58.decode(OWNER_PRIV_KEY));

export const payer = WALLET;
export const buyerOrSeller = WALLET;
export const mintAuthority = WALLET;
export const updateAuthority = WALLET;
export const transferFeeConfigAuthority = WALLET;
export const withdrawWithheldAuthority = WALLET;

export const makeTxVersion = TxVersion.V0; // LEGACY

export const METADATA_2022_PROGRAM_ID = new PublicKey(
    isMainNet 
    ? "META4s4fSmpkTbZoUsgC1oBnWB31vQcmnN8giPw51Zu"
    : "M1tgEZCz7fHqRAR3G5RLxU6c6ceQiZyFK7tzzy4Rof4"
);

export const DEFAULT_TOKEN = {
    'WSOL': new Token(TOKEN_PROGRAM_ID, new PublicKey('So11111111111111111111111111111111111111112'), 9, 'WSOL', 'WSOL'),
    'Bonk': new Token(TOKEN_PROGRAM_ID, new PublicKey(isMainNet ? 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' : ''), 5, 'Bonk', 'Bonk'),
    // 'USDC': new Token(TOKEN_PROGRAM_ID, 
    //     new PublicKey(isMainNet ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : 'EmXq3Ni9gfudTiyNKzzYvpnQqnJEMRw2ttnVXoJXjLo1'), 
    //     6, isMainNet ? 'USDC' : 'USDC-DEV', isMainNet ? 'USD Coin' : 'USDC Dev'),
    'JUP': new Token(TOKEN_PROGRAM_ID, new PublicKey(isMainNet ? 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' : ''), 6, 'JUP', 'Jupiter'),
    // 'MTT': new Token(TOKEN_PROGRAM_ID, new PublicKey(isMainNet ? '3adk4F6EJ2bCKD1m9yqjZMeAmpGFUr1yAKjyAJzjUKue' : '3adk4F6EJ2bCKD1m9yqjZMeAmpGFUr1yAKjyAJzjUKue'), 6, 'MTT', 'MyTestToken')
};

export const MAX_WITHDRAWS = 24;
export const MAX_RETRIES = 3;

export const STATS_FILE = "stats.json";
