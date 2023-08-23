import {env} from '@xenova/transformers';

// @ts-ignore
env.allowLocalModels = false;

/**
 * @type {Worker}
 */
const worker = new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module'
});

/**
 * @type {EmbeddingVector}
 */
let queryEmbedding;

/**
 * @type {Object<string, Function>}
 */
const similarityResolveMap = {};

/**
 * @type {Object<string, Function>}
 */
const tokensResolveMap = {};

/**
 * @type Function
 */
let loadResolve;

/**
 * @type Function
 */
let queryResolve;

worker.onmessage = function (event) {
    const message = event.data;
    let resolve;
    const downloadBar = document.getElementById('loading-progress');

    switch (message.type) {
        case "download":

            let downloadBar = document.getElementById('loading-progress');
            if (message.data.status === 'initiate') {

            } else if (message.data.status === 'progress') {
                if (message.data.file !== "onnx/model_quantized.onnx") { break;}

                let progress = message.data.progress.toFixed(2);
                downloadBar.style.width = progress + '%';
                downloadBar.setAttribute('aria-valuenow', progress);
            } else if (message.data.status === 'done') {

            } else if (message.data.status === 'ready') {
                downloadBar.style.width = '100%';
                downloadBar.setAttribute('aria-valuenow', 100);
                downloadBar.textContent = "";
                loadResolve();
            } else if (message.data.status === 'ready') {
                downloadBar.style.width = '100%';
                downloadBar.setAttribute('aria-valuenow', '100');
                downloadBar.textContent = '';
                loadResolve();
            }
            break;
        case 'summary':
            queryResolve(message.summary);
            break;
        case 'query':
            queryEmbedding = message.embedding;
            queryResolve();
            break;
        case 'similarity':
            resolve = similarityResolveMap[message.text];
            resolve(calculateCosineSimilarity(message.embedding));
            delete similarityResolveMap[message.text];
            break;
        case 'tokens':
            resolve = tokensResolveMap[message.text];
            resolve(message.tokens);
            delete tokensResolveMap[message.text];
            break;
        default:
            console.error('Unknown message type: ' + message.type);
    }
};

/**
 * @param {string} text
 * @returns {Promise<number>}
 */
export async function similarity(text) {
    worker.postMessage({
        type: 'similarity',
        text
    });
    return new Promise((resolve) => {
        // needs to return calculateCosineSimilarity(queryEmbedding, textEmbedding);
        similarityResolveMap[text] = resolve;
    });
}

/**
 *
 * @param {string} text
 * @returns
 */
export async function summarizeText(text) {
    worker.postMessage({
        type: 'summary',
        text
    });
    return new Promise((resolve) => {
        queryResolve = resolve;
    });
}

/**
 *
 * @param {string} text
 * @returns
 */
export async function embedQuery(text) {
    worker.postMessage({
        type: 'query',
        text
    });
    return new Promise((resolve) => {
        queryResolve = resolve;
    });
}

/**
 *
 * @param {string} text
 * @returns
 */
export async function getTokens(text) {
    worker.postMessage({
        type: 'getTokens',
        text
    });
    return new Promise((resolve) => {
        tokensResolveMap[text] = resolve;
    });
}

/**
 * @param {string} modelName
 * @returns
 */
export async function loadSemantic(modelName) {
    const downloadBar = document.getElementById('loading-progress');
    downloadBar.style.width = '0%';
    downloadBar.textContent = 'Loading model...';
    worker.postMessage({
        type: 'load',
        model_name: modelName
    });
    return new Promise((resolve) => {
        loadResolve = resolve;
    });
}

/**
 * @typedef {Array<number>} EmbeddingVector
 * @param {EmbeddingVector} embedding
 * @returns {number}
 */
function calculateCosineSimilarity(embedding) {
    let dotProduct = 0;
    let queryMagnitude = 0;
    let embeddingMagnitude = 0;
    const queryEmbeddingLength = queryEmbedding.length;
    for (let i = 0; i < queryEmbeddingLength; i++) {
        dotProduct += queryEmbedding[i] * embedding[i];
        queryMagnitude += queryEmbedding[i] ** 2;
        embeddingMagnitude += embedding[i] ** 2;
    }
    return dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(embeddingMagnitude));
}
