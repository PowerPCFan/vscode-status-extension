import { basename, parse, sep } from 'node:path';
import type { Selection, TextDocument } from 'vscode';
import { debug, env, window, workspace } from 'vscode';
import {
    CONFIG_KEYS,
    EMPTY,
    FAKE_EMPTY,
    FILE_SIZES,
    REPLACE_KEYS,
    UNKNOWN_GIT_BRANCH,
    UNKNOWN_GIT_REPO_NAME,
} from './constants';
import { log, LogLevel } from './logger';
import { getConfig, getGit, resolveFileIcon, toLower, toTitle, toUpper } from './util';

interface StatusPayload {
    details?: string | undefined;
    state?: string | undefined;
    fileName?: string | undefined;
    language?: string | undefined;
    languageIcon?: string | undefined;
    workspace?: string | undefined;
    timestamp?: number | undefined;
    isDebugging?: boolean | undefined;
    gitBranch?: string | undefined;
    gitRepo?: string | undefined;
    appName?: string | undefined;
}

async function fileDetails(_raw: string, document: TextDocument, selection: Selection) {
    let raw = _raw.slice();

    if (raw.includes(REPLACE_KEYS.TotalLines)) {
        raw = raw.replace(REPLACE_KEYS.TotalLines, document.lineCount.toLocaleString());
    }

    if (raw.includes(REPLACE_KEYS.CurrentLine)) {
        raw = raw.replace(REPLACE_KEYS.CurrentLine, (selection.active.line + 1).toLocaleString());
    }

    if (raw.includes(REPLACE_KEYS.CurrentColumn)) {
        raw = raw.replace(REPLACE_KEYS.CurrentColumn, (selection.active.character + 1).toLocaleString());
    }

    if (raw.includes(REPLACE_KEYS.FileSize)) {
        let currentDivision = 0;
        let size: number;
        try {
            ({ size } = await workspace.fs.stat(document.uri));
        } catch {
            size = document.getText().length;
        }

        const originalSize = size;
        if (originalSize > 1_000) {
            size /= 1_000;
            currentDivision++;
            while (size > 1_000) {
                currentDivision++;
                size /= 1_000;
            }
        }

        raw = raw.replace(
            REPLACE_KEYS.FileSize,
            `${originalSize > 1_000 ? size.toFixed(2) : size}${FILE_SIZES[currentDivision]}`,
        );
    }

    const git = await getGit();

    if (raw.includes(REPLACE_KEYS.GitBranch)) {
        if (git?.repositories.length) {
            raw = raw.replace(
                REPLACE_KEYS.GitBranch,
                git.repositories.find((repo) => repo.ui.selected)?.state.HEAD?.name ?? FAKE_EMPTY,
            );
        } else {
            raw = raw.replace(REPLACE_KEYS.GitBranch, UNKNOWN_GIT_BRANCH);
        }
    }

    if (raw.includes(REPLACE_KEYS.GitRepoName)) {
        if (git?.repositories.length) {
            raw = raw.replace(
                REPLACE_KEYS.GitRepoName,
                git.repositories
                    ?.find((repo) => repo.ui.selected)
                    ?.state.remotes[0]?.fetchUrl?.split('/')[1]
                    ?.replace('.git', '') ?? FAKE_EMPTY,
            );
        } else {
            raw = raw.replace(REPLACE_KEYS.GitRepoName, UNKNOWN_GIT_REPO_NAME);
        }
    }

    return raw;
}

async function details(idling: CONFIG_KEYS, editing: CONFIG_KEYS, debugging: CONFIG_KEYS) {
    const config = getConfig();
    let raw = (config[idling] as string).replace(REPLACE_KEYS.Empty, FAKE_EMPTY);

    if (window.activeTextEditor) {
        const fileName = basename(window.activeTextEditor.document.fileName);
        const { dir } = parse(window.activeTextEditor.document.fileName);
        const split = dir.split(sep);
        const dirName = split[split.length - 1];

        const workspaceFolder = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
        const workspaceFolderName = workspaceFolder?.name ?? 'No workspace';
        const workspaceName = workspace.name?.replace(REPLACE_KEYS.VSCodeWorkspace, EMPTY) ?? workspaceFolderName;
        const workspaceAndFolder = `${workspaceName}${
            workspaceFolderName === FAKE_EMPTY ? '' : ` - ${workspaceFolderName}`
        }`;

        const fileIcon = resolveFileIcon(window.activeTextEditor.document);

        if (debug.activeDebugSession) {
            raw = config[debugging] as string;
        } else {
            raw = config[editing] as string;
        }

        if (workspaceFolder) {
            const { name } = workspaceFolder;
            const relativePath = workspace.asRelativePath(window.activeTextEditor.document.fileName).split(sep);
            relativePath.splice(-1, 1);
            raw = raw.replace(REPLACE_KEYS.FullDirName, `${name}${sep}${relativePath.join(sep)}`);
        }

        try {
            raw = await fileDetails(raw, window.activeTextEditor.document, window.activeTextEditor.selection);
        } catch (error) {
            log(LogLevel.Error, `Failed to generate file details: ${error as string}`);
        }

        raw = raw
            .replace(REPLACE_KEYS.FileName, fileName)
            .replace(REPLACE_KEYS.DirName, dirName as string)
            .replace(REPLACE_KEYS.Workspace, workspaceName)
            .replace(REPLACE_KEYS.WorkspaceFolder, workspaceFolderName)
            .replace(REPLACE_KEYS.WorkspaceAndFolder, workspaceAndFolder)
            .replace(REPLACE_KEYS.LanguageLowerCase, toLower(fileIcon))
            .replace(REPLACE_KEYS.LanguageTitleCase, toTitle(fileIcon))
            .replace(REPLACE_KEYS.LanguageUpperCase, toUpper(fileIcon));
    }

    return raw;
}

export async function activity(previous: StatusPayload = {}): Promise<StatusPayload> {
    const git = await getGit();
    const appName = env.appName;

    let state: StatusPayload = {
        details: await details(CONFIG_KEYS.DetailsIdling, CONFIG_KEYS.DetailsEditing, CONFIG_KEYS.DetailsDebugging),
        timestamp: previous.timestamp ?? Date.now(),
        appName,
        isDebugging: !!debug.activeDebugSession,
    };

    // Add git information
    if (git?.repositories.length) {
        const selectedRepo = git.repositories.find((repo) => repo.ui.selected);
        if (selectedRepo) {
            state.gitBranch = selectedRepo.state.HEAD?.name ?? UNKNOWN_GIT_BRANCH;
            state.gitRepo = selectedRepo.state.remotes[0]?.fetchUrl?.split('/')[1]?.replace('.git', '') ?? UNKNOWN_GIT_REPO_NAME;
        }
    }

    if (window.activeTextEditor) {
        const fileName = basename(window.activeTextEditor.document.fileName);
        const language = resolveFileIcon(window.activeTextEditor.document);
        const languageIcon = `https://raw.githubusercontent.com/PowerPCFan/vscode-status-extension/refs/heads/main/assets/icons/${language}.png`;
        const workspaceFolder = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
        const workspaceName = workspace.name ?? workspaceFolder?.name ?? 'No workspace';

        state = {
            ...state,
            details: await details(CONFIG_KEYS.DetailsIdling, CONFIG_KEYS.DetailsEditing, CONFIG_KEYS.DetailsDebugging),
            fileName,
            language,
            languageIcon,
            workspace: workspaceName,
        };

        log(LogLevel.Trace, `VSCode language id: ${window.activeTextEditor.document.languageId}`);
    }

    return state;
}
