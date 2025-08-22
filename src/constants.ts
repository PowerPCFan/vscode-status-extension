import LANG from './data/languages.json';

export const KNOWN_EXTENSIONS: { [key: string]: { image: string } } = LANG.KNOWN_EXTENSIONS;
export const KNOWN_LANGUAGES: { image: string; language: string }[] = LANG.KNOWN_LANGUAGES;

export const EMPTY = '' as const;
export const FAKE_EMPTY = '\u200B\u200B' as const;
export const FILE_SIZES = [' bytes', 'KB', 'MB', 'GB', 'TB'] as const;

export const UNKNOWN_GIT_BRANCH = 'Unknown' as const;
export const UNKNOWN_GIT_REPO_NAME = 'Unknown' as const;

export const enum REPLACE_KEYS {
    AppName = '{app_name}',
    CurrentColumn = '{current_column}',
    CurrentLine = '{current_line}',
    DirName = '{dir_name}',
    Empty = '{empty}',
    FileName = '{file_name}',
    FileSize = '{file_size}',
    FullDirName = '{full_dir_name}',
    GitBranch = '{git_branch}',
    GitRepoName = '{git_repo_name}',
    LanguageLowerCase = '{lang}',
    LanguageTitleCase = '{Lang}',
    LanguageUpperCase = '{LANG}',
    TotalLines = '{total_lines}',
    VSCodeWorkspace = '(Workspace)',
    Workspace = '{workspace}',
    WorkspaceAndFolder = '{workspace_and_folder}',
    WorkspaceFolder = '{workspace_folder}',
}

export const enum CONFIG_KEYS {
    ApiUrl = 'apiUrl',
    AuthToken = 'authToken',
    UserId = 'userId',
    DetailsDebugging = 'detailsDebugging',
    DetailsEditing = 'detailsEditing',
    DetailsIdling = 'detailsIdling',
    Enabled = 'enabled',
    IdleTimeout = 'idleTimeout',
    SuppressNotifications = 'suppressNotifications',
    WorkspaceExcludePatterns = 'workspaceExcludePatterns',
}
