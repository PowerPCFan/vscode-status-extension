import fetch, { RequestInit, Response } from 'node-fetch';

export async function postStatus(fullUrl: string, data: any, token: string): Promise<Response> {
    const options: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    };
    return fetch(fullUrl, options) as Promise<Response>;
}

export async function registerUser(fullUrl: string, userId: string, token: string): Promise<Response> {
    const options: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
    };
    return fetch(fullUrl, options) as Promise<Response>;
}

export async function checkIfUserExists(baseUrl: string, userId: string, token: string): Promise<Response> {
    const checkUrl = `${baseUrl}/check-if-user-exists?userId=${encodeURIComponent(userId)}`;
    const options: RequestInit = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    };
    return fetch(checkUrl, options) as Promise<Response>;
}
