const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const env = require('../config/env');

/**
 * Upload a local file to IPFS via Pinata.
 * @param {string} filePath  - Absolute path to the file on disk
 * @param {string} originalName - Original filename for Pinata metadata
 * @returns {{ IpfsHash, PinSize, Timestamp, url }}
 */
async function uploadFileToIPFS(filePath, originalName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const data = new FormData();
  data.append('file', fs.createReadStream(filePath));
  data.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));
  // Built with JSON.stringify, not interpolation — originalName comes straight
  // from the client, and a quote or backslash in it would otherwise produce
  // malformed JSON that Pinata rejects with a 400.
  data.append('pinataMetadata', JSON.stringify({ name: originalName }));

  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    data,
    {
      headers: {
        Authorization: `Bearer ${env.PINATA_JWT}`,
        ...data.getHeaders(),
      },
    },
  );

  return {
    IpfsHash: response.data.IpfsHash,
    PinSize: response.data.PinSize,
    Timestamp: response.data.Timestamp,
    url: `https://${env.GATEWAY_URL}/ipfs/${response.data.IpfsHash}`,
  };
}

/**
 * Upload a JSON object to IPFS via Pinata.
 * @param {object} jsonData
 * @returns {{ IpfsHash, url }}
 */
async function uploadJSONToIPFS(jsonData) {
  const data = new FormData();
  data.append('file', Buffer.from(JSON.stringify(jsonData)), {
    filename: 'metadata.json',
    contentType: 'application/json',
  });

  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    data,
    {
      headers: {
        Authorization: `Bearer ${env.PINATA_JWT}`,
        ...data.getHeaders(),
      },
    },
  );

  return {
    IpfsHash: response.data.IpfsHash,
    url: `https://${env.GATEWAY_URL}/ipfs/${response.data.IpfsHash}`,
  };
}

module.exports = { uploadFileToIPFS, uploadJSONToIPFS };
