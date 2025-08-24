import { basename } from 'node:path';
import type { TextDocument, WorkspaceConfiguration } from 'vscode';
import { workspace, extensions } from 'vscode';
import type { API, GitExtension } from './@types/git';
import { log, LogLevel } from './logger';

let git: API | null | undefined;

type WorkspaceExtensionConfiguration = WorkspaceConfiguration & {
    apiUrl: string;
    authToken: string;
    userId: string;
    detailsDebugging: string;
    detailsEditing: string;
    detailsIdling: string;
    enabled: boolean;
    idleTimeout: number;
    suppressNotifications: boolean;
    workspaceExcludePatterns: string[];
};

export function getConfig() {
    return workspace.getConfiguration('vscodeStatus') as WorkspaceExtensionConfiguration;
}

export function generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function generateUserId(): string {
    let result = (Math.floor(Math.random() * 9) + 1).toString(); // First digit: 1-9

    for (let i = 0; i < 15; i++) {
        result += Math.floor(Math.random() * 10).toString(); // Digits 0-9
    }

    return result;
}

export const toLower = (str: string) => str.toLocaleLowerCase();

export const toUpper = (str: string) => str.toLocaleUpperCase();

export const toTitle = (str: string) => toLower(str).replace(/^\w/, (char) => toUpper(char));

export async function getGit() {
    if (git || git === null) {
        return git;
    }

    try {
        log(LogLevel.Debug, 'Loading git extension');
        const gitExtension = extensions.getExtension<GitExtension>('vscode.git');
        if (!gitExtension?.isActive) {
            log(LogLevel.Trace, 'Git extension not activated, activating...');
            await gitExtension?.activate();
        }

        git = gitExtension?.exports.getAPI(1);
    } catch (error) {
        git = null;
        log(LogLevel.Error, `Failed to load git extension, is git installed?; ${error as string}`);
    }

    return git;
}
