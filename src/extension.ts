import throttle from 'lodash-es/throttle';
import type { ExtensionContext, StatusBarItem } from 'vscode';
import { commands, StatusBarAlignment, window, workspace, debug, ConfigurationTarget } from 'vscode';
import { activity } from './activity';
import { CONFIG_KEYS } from './constants';
import { log, LogLevel } from './logger';
import { getConfig, getGit, generateGuid, generateUserId } from './util';
import { postStatus } from './apiClient';

const statusBarIcon: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
statusBarIcon.text = '$(pulse) Connecting to API...';

const config = getConfig();


let state = {};
let idle: NodeJS.Timeout | undefined;
let listeners: { dispose(): any }[] = [];

const STATUS_POST_INTERVAL_MS = 10_000; // 10 seconds
const throttledSendActivity = throttle(sendActivity, STATUS_POST_INTERVAL_MS, {
    leading: false,
    trailing: true
});

export function cleanUp() {
    for (const listener of listeners) listener.dispose();
    listeners = [];
}

// Make the status bar item clickable to retry connecting when in an error state
function makeStatusBarRetryable() {
    statusBarIcon.command = 'vscodeStatus.reconnect';
    statusBarIcon.tooltip = 'Click to retry';
}

// Clear any clickable command when connected/connecting
function clearStatusBarCommand() {
    statusBarIcon.command = undefined;
}

async function sendActivity() {
    state = {
        ...(await activity(state)),
    };
    
    // Send POST request to API
    await sendStatusToAPI(state);
}

async function sendStatusToAPI(statusData: any) {
    const now = Date.now();
    const config = getConfig();
    const apiUrl = config[CONFIG_KEYS.ApiUrl];
    const authToken = config[CONFIG_KEYS.AuthToken];
    const userId = config[CONFIG_KEYS.UserId];

    try {
        // Always include userId in the outgoing status data
        const statusPayload = {
            timestamp: now,
            userId: userId,
            ...statusData,
        };
        log(LogLevel.Debug, `Sending status payload: ${JSON.stringify(statusPayload)}`);
        const response = await postStatus(apiUrl, statusPayload, authToken);

        if (response.ok) {
            const responseData = await response.json() as any;
            statusBarIcon.text = '$(globe) Connected to API';
            statusBarIcon.tooltip = 'Connected to API';
            clearStatusBarCommand();
            log(LogLevel.Debug, 'Successfully sent status to API');
            // If this was a new user registration, show a notification
            if (responseData.new_user) {
                if (!config[CONFIG_KEYS.SuppressNotifications]) {
                    void window.showInformationMessage(`Successfully registered extension with API as user: ${userId}`);
                }
            }
        } else {
            // Handle specific error cases
            let errorMessage = `API returned status ${response.status}: ${response.statusText}`;
            let shouldShowNotification = true;
            
            try {
                const errorData = await response.json() as any;
                if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch {
                // If we can't parse the error response, use the default message
            }

            // Handle specific HTTP status codes
            switch (response.status) {
                case 401:
                    // Authentication failed - invalid token
                    log(LogLevel.Error, `Authentication failed: ${errorMessage}`);
                    statusBarIcon.text = '$(warning) Auth Failed';
                    statusBarIcon.tooltip = `Authentication failed. Generate a new token using the command palette.`;
                    if (!config[CONFIG_KEYS.SuppressNotifications]) {
                        const action = await window.showErrorMessage(
                            `API authentication failed. Your token may be invalid.`,
                            'Generate New Token',
                            'Disable Extension'
                        );
                        if (action === 'Generate New Token') {
                            await commands.executeCommand('vscodeStatus.generateNewToken');
                            await commands.executeCommand('vscodeStatus.reconnect');
                        } else if (action === 'Disable Extension') {
                            await commands.executeCommand('vscodeStatus.disable');
                        }
                    }
                    shouldShowNotification = false;
                    break;
                    
                case 409:
                    // User already exists (shouldn't happen in normal flow)
                    log(LogLevel.Warn, `User registration conflict: ${errorMessage}`);
                    statusBarIcon.text = '$(warning) User Conflict';
                    statusBarIcon.tooltip = `User ID conflict. Generate a new user ID.`;
                    if (!config[CONFIG_KEYS.SuppressNotifications]) {
                        const action = await window.showWarningMessage(
                            `User ID conflict detected. Generate a new user ID?`,
                            'Generate New User ID'
                        );
                        if (action === 'Generate New User ID') {
                            await commands.executeCommand('vscodeStatus.generateNewUserId');
                            await commands.executeCommand('vscodeStatus.reconnect');
                        }
                    }
                    shouldShowNotification = false;
                    break;
                    
                case 404:
                    // API endpoint not found
                    log(LogLevel.Error, `API endpoint not found: ${errorMessage}`);
                    statusBarIcon.text = '$(warning) API Not Found';
                    statusBarIcon.tooltip = `API endpoint not found. Check your API URL configuration.`;
                    break;
                    
                case 429:
                    // Rate limited
                    log(LogLevel.Warn, `Rate limited: ${errorMessage}`);
                    statusBarIcon.text = '$(clock) Rate Limited';
                    statusBarIcon.tooltip = `API rate limited. Will retry automatically.`;
                    shouldShowNotification = false; // Don't spam user with rate limit notifications
                    break;
                    
                case 500:
                case 502:
                case 503:
                case 504:
                    // Server errors
                    log(LogLevel.Error, `Server error: ${errorMessage}`);
                    statusBarIcon.text = '$(warning) Server Error';
                    statusBarIcon.tooltip = `Server error: ${errorMessage}`;
                    break;
                    
                default:
                    // Other errors
                    log(LogLevel.Error, `Unexpected API error: ${errorMessage}`);
                    statusBarIcon.text = '$(warning) API Error';
                    statusBarIcon.tooltip = `API error: ${errorMessage}`;
                    break;
            }
            
            if (shouldShowNotification && !config[CONFIG_KEYS.SuppressNotifications]) {
                void window.showErrorMessage(`API error: ${errorMessage}`);
            }
            // Allow user to click the status bar to retry
            makeStatusBarRetryable();
            
            throw new Error(errorMessage);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Handle different types of network errors
        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
            log(LogLevel.Error, `Network connection failed: ${errorMessage}`);
            statusBarIcon.text = '$(warning) Connection Failed';
            statusBarIcon.tooltip = `Cannot connect to API server. Check your API URL and network connection.`;
            if (!config[CONFIG_KEYS.SuppressNotifications]) {
                void window.showErrorMessage(`Cannot connect to API. Check your API URL in settings.`);
            }
            makeStatusBarRetryable();
        } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            log(LogLevel.Warn, `API request timeout: ${errorMessage}`);
            statusBarIcon.text = '$(clock) Request Timeout';
            statusBarIcon.tooltip = `API request timed out. Will retry automatically.`;
            // Don't show notification for timeouts to avoid spam
            makeStatusBarRetryable();
        } else if (errorMessage.includes('certificate') || errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
            log(LogLevel.Error, `SSL/TLS error: ${errorMessage}`);
            statusBarIcon.text = '$(warning) SSL Error';
            statusBarIcon.tooltip = `SSL/TLS certificate error. Check your API URL and certificates.`;
            if (!config[CONFIG_KEYS.SuppressNotifications]) {
                void window.showErrorMessage(`SSL/TLS error connecting to API: ${errorMessage}`);
            }
            makeStatusBarRetryable();
        } else {
            log(LogLevel.Error, `Failed to send status to API: ${errorMessage}`);
            statusBarIcon.text = '$(warning) API Connection Failed';
            statusBarIcon.tooltip = `API connection failed`;
            if (!config[CONFIG_KEYS.SuppressNotifications]) {
                void window.showErrorMessage(`Failed to connect to the API: ${errorMessage}`);
            }
            makeStatusBarRetryable();
        }
    }
}

async function connect() {
    log(LogLevel.Info, 'Connecting to API');
    
    cleanUp();

    statusBarIcon.text = '$(globe) Connected to API';
    statusBarIcon.tooltip = 'Connected to API';
    clearStatusBarCommand();

    void throttledSendActivity();
    const onChangeActiveTextEditor = window.onDidChangeActiveTextEditor(async () => throttledSendActivity());
    const onChangeTextDocument = workspace.onDidChangeTextDocument(() => throttledSendActivity());
    const onStartDebugSession = debug.onDidStartDebugSession(async () => throttledSendActivity());
    const onTerminateDebugSession = debug.onDidTerminateDebugSession(async () => throttledSendActivity());

    listeners.push(onChangeActiveTextEditor, onChangeTextDocument, onStartDebugSession, onTerminateDebugSession);
}

export async function activate(context: ExtensionContext) {
    log(LogLevel.Info, 'VSCode Status activated');

    // Ensure userId and authToken are generated and saved only if missing or empty
    let userId = config[CONFIG_KEYS.UserId];
    if (!userId || typeof userId !== 'string' || userId.trim() === '' || userId.length < 16) {
        userId = generateUserId();
        try {
            await config.update('userId', userId, ConfigurationTarget.Global);
            log(LogLevel.Info, `Generated new user ID (activate): ${userId}`);
        } catch (error) {
            log(LogLevel.Error, `Failed to save user ID (activate): ${error as string}`);
        }
    }

    let authToken = config[CONFIG_KEYS.AuthToken];
    if (!authToken || typeof authToken !== 'string' || authToken.trim() === '' || authToken.length < 8) {
        authToken = generateGuid();
        try {
            await config.update('authToken', authToken, ConfigurationTarget.Global);
            log(LogLevel.Info, `Generated new authentication token (activate): ${authToken}`);
        } catch (error) {
            log(LogLevel.Error, `Failed to save authentication token (activate): ${error as string}`);
        }
    }

    let isWorkspaceExcluded = false;
    for (const pattern of config[CONFIG_KEYS.WorkspaceExcludePatterns]) {
        const regex = new RegExp(pattern);
        const folders = workspace.workspaceFolders;
        if (!folders) break;
        if (folders.some((folder) => regex.test(folder.uri.fsPath))) {
            isWorkspaceExcluded = true;
            break;
        }
    }

    const enable = async (update = true) => {
        if (update) {
            try {
                await config.update('enabled', true, ConfigurationTarget.Global); // Save to user settings (global)
            } catch {}
        }

        log(LogLevel.Info, 'Enable: Cleaning up old listeners');
        cleanUp();
        statusBarIcon.text = '$(pulse) Connecting to API...';
        clearStatusBarCommand();
        statusBarIcon.show();
        log(LogLevel.Info, 'Enable: Attempting to connect to API');
        void connect();
    };

    const disable = async (update = true) => {
        if (update) {
            try {
                await config.update('enabled', false, ConfigurationTarget.Global); // Save to user settings (global)
            } catch {}
        }

        log(LogLevel.Info, 'Disable: Cleaning up old listeners');
        cleanUp();
        log(LogLevel.Info, 'Disable: Disconnected from API');
        statusBarIcon.hide();
    };

    const enabler = commands.registerCommand('vscodeStatus.enable', async () => {
        await disable();
        await enable();
        await window.showInformationMessage('Enabled VSCode Status');
    });

    const disabler = commands.registerCommand('vscodeStatus.disable', async () => {
        await disable();
        await window.showInformationMessage('Disabled VSCode Status');
    });

    const reconnecter = commands.registerCommand('vscodeStatus.reconnect', async () => {
        await disable(false);
        await enable(false);
    });

    const generateNewToken = commands.registerCommand('vscodeStatus.generateNewToken', async () => {
        const newToken = generateGuid();
        try {
            await config.update('authToken', newToken, ConfigurationTarget.Global); // Save to user settings (global)
            await window.showInformationMessage(`Generated new authentication token: ${newToken}`);
            log(LogLevel.Info, `Generated new authentication token: ${newToken}`);
        } catch (error) {
            await window.showErrorMessage(`Failed to generate new token: ${error as string}`);
            log(LogLevel.Error, `Failed to generate new token: ${error as string}`);
        }
    });

    const generateNewUserId = commands.registerCommand('vscodeStatus.generateNewUserId', async () => {
        const newUserId = generateUserId();
        try {
            await config.update('userId', newUserId, ConfigurationTarget.Global); // Save to user settings (global)
            await window.showInformationMessage(`Generated new user ID: ${newUserId}`);
            log(LogLevel.Info, `Generated new user ID: ${newUserId}`);
        } catch (error) {
            await window.showErrorMessage(`Failed to generate new user ID: ${error as string}`);
            log(LogLevel.Error, `Failed to generate new user ID: ${error as string}`);
        }
    });

    context.subscriptions.push(enabler, disabler, reconnecter, generateNewToken, generateNewUserId);

    if (!isWorkspaceExcluded && config[CONFIG_KEYS.Enabled]) {
        statusBarIcon.show();
        await connect();
    }

    window.onDidChangeWindowState(async (windowState) => {
        if (config[CONFIG_KEYS.IdleTimeout] !== 0) {
            if (windowState.focused) {
                if (idle) {
                    clearTimeout(idle);
                }

                throttledSendActivity();
            } else {
                idle = setTimeout(async () => {
                    state = {};
                    // When idle, just stop sending updates
                }, config[CONFIG_KEYS.IdleTimeout] * 1_000);
            }
        }
    });

    await getGit();
}

export function deactivate() {
    cleanUp();
}
