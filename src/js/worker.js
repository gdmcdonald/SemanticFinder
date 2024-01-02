import { pipeline, AutoTokenizer } from '@xenova/transformers';
import pako from 'pako';

// env.useBrowserCache = false; // for testing

/**
 * @type {Object<string, EmbeddingVector>}
 */
let embeddingsDict = {};

/**
 * @type {Pipeline}
 */
// embedding models
let embedder;
let tokenizer;

// chat model
let chat_generator;
let chat_tokenizer;

// summary model
let summary_generator;
let summary_tokenizer;

async function token_to_text(beams, tokenizer_type) {
    //let chatTokenizer = await AutoTokenizer.from_pretrained(chatModel);
    let decoded_text = tokenizer_type.decode(beams[0].output_token_ids, {
        skip_special_tokens: true
    });
    //console.log(decoded_text);
    return decoded_text
}

/**
 * @param {string} text
 * @returns {Promise<EmbeddingVector>}
 */
async function embed(text) {
    if (text in embeddingsDict) {
        return embeddingsDict[text];
    }
    const e0 = await embedder(text, { pooling: 'mean', normalize: true });
    embeddingsDict[text] = e0.data;
    return e0.data;
}

async function getTokens(text) {
    return await tokenizer(text).input_ids.data;
}

async function chat(text, max_new_tokens = 100) {
    return new Promise(async (resolve, reject) => {
        try {
            const thisChat = await chat_generator(text, {
                max_new_tokens: max_new_tokens,
                return_prompt: false,
                callback_function: async function (beams) {
                    const decodedText = await token_to_text(beams,chat_tokenizer);
                    //console.log(decodedText);

                    self.postMessage({
                        type: 'chat',
                        chat_text: decodedText,
                    });

                    resolve(decodedText); // Resolve the main promise with chat text
                },
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function summary(text, max_new_tokens = 100) {
    return new Promise(async (resolve, reject) => {
        try {
            const thisSummary = await summary_generator(text, {
                max_new_tokens: max_new_tokens,
                return_prompt: false,
                callback_function: async function (beams) {
                    const decodedText = await token_to_text(beams,summary_tokenizer);
                    //console.log(beams)

                    self.postMessage({
                        type: 'summary',
                        summary_text: decodedText,
                    });

                    resolve(decodedText); // Resolve the main promise with chat text
                },
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Function to update embeddingsDict
const updateEmbeddingsDict = (newData) => {
    embeddingsDict = newData;
    postMessage({ type: 'updateEmbeddingsDict', data: embeddingsDict });
  };
  
  // Expose a function to manually update embeddingsDict
  self.updateEmbeddingsDictManually = updateEmbeddingsDict;

  self.onmessage = async (event) => {
    const message = event.data;
    let text;
    let embedding;
     
    // Other cases in your existing switch statement
    switch (message.type) {
        case 'logEmbeddingsDict':
            console.log(embeddingsDict);
            break
        case 'importEmbeddingsDict':
            embeddingsDict = message.data;
            break
        case 'exportEmbeddingsDict':
            const embeddingsArray = {};
            for (const key in embeddingsDict) {
                embeddingsArray[key] = Object.values(embeddingsDict[key]);
            }
            const jsonStr = JSON.stringify(embeddingsArray);

            // Gzip the JSON string
            const gzippedData = pako.gzip(jsonStr, { to: 'string' });

            // Send the gzipped data as a response
            self.postMessage({ type: 'embeddingsDict', data: gzippedData });
            break;
        case 'load':
            embeddingsDict = {}; // clear dict
            tokenizer = await AutoTokenizer.from_pretrained(message.model_name); // no progress callbacks -- assume its quick
            embedder = await pipeline('feature-extraction', message.model_name,
                {
                    quantized: message.quantized,
                    progress_callback: data => {
                        self.postMessage({
                            type: 'download',
                            data
                        });
                    }
                    
                });
            break;
        case 'load_summary':
            summary_tokenizer = await AutoTokenizer.from_pretrained(message.model_name) 
            summary_generator = await pipeline('summarization', message.model_name,
                {
                    progress_callback: data => {
                        self.postMessage({
                            type: 'summary_download',
                            data
                        });
                    }
                    //quantized: message.quantized // currently not possible, models unquantized way too large!
                });
            break;
        case 'load_chat':
            console.log("loading chat")
            chat_tokenizer = await AutoTokenizer.from_pretrained(message.model_name) // no progress callbacks -- assume its quick
            chat_generator = await pipeline('text2text-generation', message.model_name,
                {
                    progress_callback: data => {
                        self.postMessage({
                            type: 'chat_download',
                            data
                        });
                    }
                    //quantized: message.quantized // currently not possible, models unquantized way too large!
                });
            break;
        case 'query':
            text = message.text;
            embedding = await embed(text);
            self.postMessage({
                type: 'query',
                embedding
            });
            break;
        case 'similarity':
            text = message.text;
            embedding = await embed(text);
            self.postMessage({
                type: 'similarity',
                text,
                embedding
            });
            break;
        case 'getTokens':
            text = message.text;
            self.postMessage({
                type: 'tokens',
                text,
                tokens: await getTokens(text)
            });
            break;
        case 'summary':
            text = message.text;
            let summary_text = await summary(text, message.max_new_tokens);
            self.postMessage({
                type: 'summary',
                summary_text
            });
            break;
        case 'chat':
            text = message.text;
            let chat_text = await chat(text, message.max_new_tokens);
            self.postMessage({
                type: 'chat',
                chat_text
            });
            break;

        default:
    }
};
