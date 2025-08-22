import fetch, { RequestInit, Response } from 'node-fetch';

export async function postStatus(url: string, data: any, token: string): Promise<Response> {
    const options: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    };
    return fetch(url, options) as Promise<Response>;
}

export async function registerUser(url: string, userId: string, token: string): Promise<Response> {
    const options: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
    };
    return fetch(url, options) as Promise<Response>;
}
