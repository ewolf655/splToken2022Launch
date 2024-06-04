import fetch from 'cross-fetch';


const BACKEND_URL = 'http://localhost:8888/api/reward/';

export const getPendingRewards = async () => {
    try {
        const res = await fetch(BACKEND_URL + `pendings`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const resData = await res.json();
        // console.log('resData:', resData);
        if (resData.error) {
            console.error(resData.error);
        } else {
            if (resData.data !== undefined) {
                return resData.data;
            } else {
                console.error('failed to get pendings');
            }
        }
    } catch (error) {
        console.error(error);
    }

    return [];
}

export const setRewardTokenAmount = async (account: string, solAmount: number, bonkAmount: number, jupAmount: number) => {
    try {
        const res = await fetch(BACKEND_URL + `set_token_amount`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                'account': account,
                'solAmount': solAmount,
                'bonkAmount': bonkAmount,
                'jupAmount': jupAmount,
            })
        });

        const resData = await res.json();
        // console.log('resData:', resData);
        if (resData.error) {
            console.error(resData.error);
        } else {
            // console.log(resData.status);
            return true;
        }
    } catch (error) {
        console.error(error);
    }

    return false;
}

export const addRewardTokenAmount = async (account: string, solAddend: number, bonkAddend: number, jupAddend: number) => {
    try {
        const res = await fetch(BACKEND_URL + `add_token_amount`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                'account': account,
                'solAddend': solAddend,
                'bonkAddend': bonkAddend,
                'jupAddend': jupAddend,
            })
        });

        const resData = await res.json();
        // console.log('resData:', resData);
        if (resData.error) {
            console.error(resData.error);
        } else {
            // console.log(resData.status);
            return true;
        }
    } catch (error) {
        console.error(error);
    }

    return false;
}
