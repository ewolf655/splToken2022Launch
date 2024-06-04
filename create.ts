
import {
    sendAndConfirmTransaction,
    Keypair,
    SystemProgram,
    Transaction,
    PublicKey,
} from "@solana/web3.js";

import {
    ExtensionType,
    createInitializeMintInstruction,
    mintTo,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
    createInitializeTransferFeeConfigInstruction,
    createAssociatedTokenAccountIdempotent,
    setAuthority,
    AuthorityType,
} from "@solana/spl-token";

import {
    Metaplex,
    bundlrStorage,
    keypairIdentity,
    toMetaplexFile,
} from "@metaplex-foundation/js";

import {
    DataV2,
    createCreateMetadataAccountV3Instruction,
    createUpdateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata";

import {
    isMainNet,
    connection,
    networkUrl,
    INIT_FEE_PERCENTAGE,
    maxFeeTokens,
    TOTAL_SUPPLY,
    METADATA_2022_PROGRAM_ID,
    TOKEN_DECIMALS,
    TOKEN_DESCRIPTION,
    TOKEN_IMG_NAME,
    TOKEN_IMG_PATH,
    TOKEN_NAME,
    TOKEN_SYMBOL,
    payer,
    WALLET,
    mintAuthority,
    updateAuthority,
    transferFeeConfigAuthority,
    withdrawWithheldAuthority,
} from "./config";

import {
    generateExplorerTxUrl,
    sleep,
} from "./utils";

import * as fs from "fs";


const BUNDLR_URL = isMainNet ? "https://node1.bundlr.network" : "https://devnet.bundlr.network";


// Define the extensions to be used by the mint
const extensions = [
    ExtensionType.TransferFeeConfig,
    // ExtensionType.MetadataPointer,
];

// Calculate the length of the mint
const mintLen = getMintLen(extensions);
const mintAmount = BigInt(TOTAL_SUPPLY * Math.pow(10, TOKEN_DECIMALS)); // Mint 1,000,000 tokens


const createNewToken = async () => {
    const mintKeypair = Keypair.generate();
    const minter = mintKeypair.publicKey;
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    
    const mintTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: WALLET.publicKey,
            newAccountPubkey: minter,
            space: mintLen,
            lamports: mintLamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeTransferFeeConfigInstruction(
            minter,
            transferFeeConfigAuthority.publicKey,
            withdrawWithheldAuthority.publicKey,
            INIT_FEE_PERCENTAGE,
            maxFeeTokens,
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(
            minter,
            TOKEN_DECIMALS,
            mintAuthority.publicKey,
            null,
            TOKEN_2022_PROGRAM_ID
        )
    );

    const newTokenTx = await sendAndConfirmTransaction(
        connection,
        mintTransaction,
        [payer, mintKeypair],
        undefined
    );
    
    console.log("New token created:", generateExplorerTxUrl(newTokenTx));
    console.log("  Token address:", minter.toBase58());

    return minter;
}

const registerToken = async(mint: PublicKey) => {
    const metaplex = Metaplex.make(connection)
        .use(keypairIdentity(WALLET))
        .use(
            bundlrStorage({
                address: BUNDLR_URL,
                providerUrl: networkUrl,
                timeout: 60000
            })
        );
    const [metadataPDA] = await PublicKey.findProgramAddress(
        [
            Buffer.from("metadata"),
            METADATA_2022_PROGRAM_ID.toBuffer(),
            mint.toBuffer()
        ],
        METADATA_2022_PROGRAM_ID
    );
    console.log(`Got metadataAccount address: ${metadataPDA}`);

    // read file to buffer
    const buffer = fs.readFileSync(TOKEN_IMG_PATH);
    // buffer to metaplex file
    const file = toMetaplexFile(buffer, TOKEN_IMG_NAME);

    // upload image and get image uri
    const imageUri = await metaplex.storage().upload(file);
    console.log("  imageUri:", imageUri);

    // upload metadata and get metadata uri (off chain metadata)
    const { uri } = await metaplex.nfts().uploadMetadata({
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        description: TOKEN_DESCRIPTION,
        image: imageUri,
    });
    console.log("  metadataUri:", uri);

    // onchain metadata format
    const tokenMetadata = {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        uri: uri,
        sellerFeeBasisPoints: INIT_FEE_PERCENTAGE,
        creators: null,
        collection: null,
        uses: null
    } as DataV2;

    console.log("=============================");
    console.log("Creating Transaction");
    console.log("=============================");

    // transaction to create metadata account
    const transaction = new Transaction().add(
        createCreateMetadataAccountV3Instruction(
            {
                metadata: metadataPDA,
                mint: mint,
                mintAuthority: mintAuthority.publicKey,
                payer: payer.publicKey,
                updateAuthority: updateAuthority.publicKey,
            },
            {
                createMetadataAccountArgsV3: {
                    data: tokenMetadata,
                    isMutable: true,
                    collectionDetails: null
                }
            },
            METADATA_2022_PROGRAM_ID
        )
    );
    console.log("Begin sendAndConfirmTransaction");

    // send transaction
    const metadataSig = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("Token metadata uploaded:", generateExplorerTxUrl(metadataSig));
}

const mintToken = async (mint: PublicKey, mintAuthority: Keypair, mintAmount: bigint) => {
    const sourceAccount = await createAssociatedTokenAccountIdempotent(
        connection,
        payer,
        mint,
        WALLET.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
    );
    const mintSig = await mintTo(
        connection,
        payer,
        mint,
        sourceAccount,
        mintAuthority,
        mintAmount,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID
    );
    console.log("Tokens minted:", generateExplorerTxUrl(mintSig));
    await sleep(5000);
}


export const createToken = async () => {
    // /* Step 0 - Check the owner's private key */
    // if (!(await isValidAddrWithBlockscan())) {
    //     console.error("Invalid address, please check the address again.");
    //     return false;
    // }

    /* Step 1 - Create a new token */
    const mint: PublicKey = await createNewToken();
    await sleep(5000);

    /* Step 2 - Register the token */
    await registerToken(mint);

    /* Step 3 - Mint tokens to owner */
    await mintToken(mint, mintAuthority, mintAmount);

    /* Step 4 - Remove mint authority */
    const disableMintSig = await setAuthority(
        connection,
        payer,
        mint,
        mintAuthority,
        AuthorityType.MintTokens,
        null,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID
    );
    console.log("Mint function disabled:", generateExplorerTxUrl(disableMintSig));

    return mint;
}


async function uploadMetadata(METAPLEX: Metaplex, imgUri: string, imgType: string, nftName: string, description: string, attributes: {trait_type: string, value: string}[]) {
    console.log(`Step 2 - Uploading MetaData`);
    const { uri } = await METAPLEX
        .nfts()
        .uploadMetadata({
            name: nftName,
            description: description,
            image: imgUri,
            properties: {
                files: [
                    {
                        type: imgType,
                        uri: imgUri,
                    },
                ]
            }
        });
    console.log('    Metadata URI:', uri);

    return uri;
}

async function updateNft(METAPLEX: Metaplex, nft: any, metadataUri: string, newName: string) {
    console.log(`Step 3 - Updating NFT`);
    await METAPLEX
        .nfts()
        .update({
            name: newName, 
            nftOrSft: nft,
            uri: metadataUri
        }, { commitment: 'finalized' });
    console.log(`   Success!🎉`);
    console.log(`   Updated NFT: https://explorer.solana.com/address/${nft.address}`);
}

export const updateToken = async(mint: PublicKey) => {
    const metaplex = Metaplex.make(connection)
        .use(keypairIdentity(WALLET))
        .use(
            bundlrStorage({
                address: BUNDLR_URL,
                providerUrl: networkUrl,
                timeout: 60000
            })
        );
    const [metadataPDA] = await PublicKey.findProgramAddress(
        [
            Buffer.from("metadata"),
            METADATA_2022_PROGRAM_ID.toBuffer(),
            mint.toBuffer()
        ],
        METADATA_2022_PROGRAM_ID
    );
    console.log(`Got metadataAccount address: ${metadataPDA}`);

    // upload image and get image uri
    // const imageUri = 'https://arweave.net/pg_balJfTXc_QXAyqsnYIVBvV99qbNebR-32kgfmNoU';  // MRT -> MRT2
    // const imageUri = 'https://bafkreifrsc5qivhhz3pawlgk3cnkbr75dtk4hyrhy4kpycvku2ug4b4wzq.ipfs.nftstorage.link'; // MRT4 -> MRT44
    const imageUri = 'https://arweave.net/DwLICzkDmF6mtrPzrEdr-NQrmakirRW6DXqU3mx9qbE'; // VENUS -> Venus Protocol

    // upload metadata and get metadata uri (off chain metadata)
    const { uri } = await metaplex.nfts().uploadMetadata({
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        description: TOKEN_DESCRIPTION,
        image: imageUri,
    });
    console.log("  metadataUri:", uri);

    // onchain metadata format
    const tokenMetadata = {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        uri: uri,
        sellerFeeBasisPoints: INIT_FEE_PERCENTAGE,
        creators: null,
        collection: null,
        uses: null
    } as DataV2;

    console.log("=============================");
    console.log("Creating Transaction");
    console.log("=============================");

    // transaction to create metadata account
    const transaction = new Transaction().add(
        createUpdateMetadataAccountV2Instruction(
            {
                metadata: metadataPDA,
                updateAuthority: updateAuthority.publicKey,
            },
            {
                updateMetadataAccountArgsV2: {
                    data: tokenMetadata,
                    updateAuthority: updateAuthority.publicKey,
                    primarySaleHappened: true,
                    isMutable: true,
                }
            },
            METADATA_2022_PROGRAM_ID
        )
    );
    console.log("Begin sendAndConfirmTransaction");

    // send transaction
    const metadataSig = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("Token metadata uploaded:", generateExplorerTxUrl(metadataSig));
}
