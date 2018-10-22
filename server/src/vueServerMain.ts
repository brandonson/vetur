import {
  createConnection,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  WorkspaceFolder
} from 'vscode-languageserver';
import Uri from 'vscode-uri';
import { VLS } from './services/vls';
import * as fs from 'fs';
import { promisify } from 'util';

// Create a connection for the server
const connection =
  process.argv.length <= 2
    ? createConnection(process.stdin, process.stdout) // no arg specified
    : createConnection();

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites
connection.onInitialize((params: InitializeParams): Thenable<InitializeResult> => {
  const initializationOptions = params.initializationOptions;

  if (params.workspaceFolders) {
    const promises = params.workspaceFolders!.map(wf => tryFolder(wf, initializationOptions));
    let rootPromise = promises[0];
    for (const p of promises.slice(1)) {
        rootPromise = rootPromise.then((v) => v || p);
    }
    return rootPromise.then((v) => Promise.resolve(v || {
        capabilities: {}
    }));
  }
  return Promise.resolve(initForPath(params.rootPath, initializationOptions));
});

async function tryFolder(folder: WorkspaceFolder, initOptions: any): Promise<InitializeResult | null> {
    const uri = Uri.parse(folder.uri);
    if (uri.scheme !== 'file') {
        return null;
    } else {
        const path = uri.fsPath;
        const fullpath = path + '/package.json';
        let data = null;
        try {
            data = await promisify(fs.readFile)(fullpath, 'utf8');
        } catch (e) {
            console.log('No package.json for a folder. Error: ' + e);
            //ignore except for log, probably just not a node package
            //logging is good for user debugging purposes
        }
        if (data) {
            try {
                const json = JSON.parse(data);
                if ('vue' in json.dependencies) {
                    return initForPath(path, initOptions);
                }
            } catch (e) {
                console.error('Bad json in ' + path);
            }
        }

        return null;
    }

}

function initForPath(path: string | null | undefined, initializationOptions: any): InitializeResult {
  if (!path) {
    console.error('No workspace path found. Vetur initialization failed');
    return {
      capabilities: {}
    };
  }
  console.log('Vetur initialized using ' + path);
  const vls = new VLS(path, connection);

  if (initializationOptions) {
    vls.configure(initializationOptions.config);
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: { resolveProvider: true, triggerCharacters: ['.', ':', '<', '"', "'", '/', '@', '*'] },
      signatureHelpProvider: { triggerCharacters: ['('] },
      documentFormattingProvider: true,
      hoverProvider: true,
      documentHighlightProvider: true,
      documentLinkProvider: {
        resolveProvider: false
      },
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      colorProvider: true
    }
  };

}

connection.listen();
