import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient';
import { generateGrammarCommandHandler } from './grammar';
import { registerLanguageConfigurations } from './languages';
import { initializeLanguageClient } from './client';

/**
 * Significant portions of the multi-root support come from the Microsoft sample
 * here:
 * https://github.com/Microsoft/vscode-extension-samples/blob/master/lsp-multi-server-sample/client/src/extension.ts
 */

let serverModule: string;

export function activate(context: vscode.ExtensionContext) {
  /**
   * Custom Block Grammar generation command
   */
  context.subscriptions.push(
    vscode.commands.registerCommand('vetur.generateGrammar', generateGrammarCommandHandler(context.extensionPath))
  );

  registerLanguageConfigurations();

  /**
   * Vue Language Server Initialization
   */

  serverModule = context.asAbsolutePath(path.join('server', 'dist', 'vueServerMain.js'));

  vscode.workspace.onDidOpenTextDocument(onDocumentOpen);
  vscode.workspace.textDocuments.forEach(onDocumentOpen);
  vscode.workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder  of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });
}

function registerCustomClientNotificationHandlers(client: LanguageClient) {
  client.onNotification('$/displayInfo', (msg: string) => {
    vscode.window.showInformationMessage(msg);
  });
  client.onNotification('$/displayWarning', (msg: string) => {
    vscode.window.showWarningMessage(msg);
  });
  client.onNotification('$/displayError', (msg: string) => {
    vscode.window.showErrorMessage(msg);
  });
}

const clients: Map<string, LanguageClient> = new Map();

let _sortedWorkspaceFolders: string[] | undefined;
function sortedWorkspaceFolders(): string[] | undefined {
  if (!vscode.workspace.workspaceFolders) {
    return undefined;
  }

  if (_sortedWorkspaceFolders === void 0) {
    _sortedWorkspaceFolders = vscode.workspace.workspaceFolders.map(folder => {
      let result = folder.uri.toString();
      if (result.charAt(result.length - 1) !== '/') {
        result = result + '/';
      }
      return result;
    }).sort(
      (a, b) => {
        return a.length - b.length;
      }
    );
  }
  return _sortedWorkspaceFolders;
}
vscode.workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined);

function getOuterMostWorkspaceFolder(folder: vscode.WorkspaceFolder): vscode.WorkspaceFolder | undefined {
  const sorted = sortedWorkspaceFolders();
  if (!sorted) {
    return undefined;
  }
  for (const element of sorted) {
    let uri = folder.uri.toString();
    if (uri.charAt(uri.length - 1) !== '/') {
      uri = uri + '/';
    }
    if (uri.startsWith(element)) {
      return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(element));
    }
  }
  return folder;
}


function onDocumentOpen(doc: vscode.TextDocument) {
  if (doc.languageId !== 'vue' || doc.uri.scheme !== 'file') {
    return;
  }

  let folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!folder) {
    return;
  }

  folder = getOuterMostWorkspaceFolder(folder);
  if (!folder) {
    return;
  }

  if (!clients.has(folder.uri.toString())) {
    const client = initializeLanguageClient(serverModule, folder);
    client.start();
    clients.set(folder.uri.toString(), client);
    client.onReady().then(() => {
      registerCustomClientNotificationHandlers(client);
    });
  }
}