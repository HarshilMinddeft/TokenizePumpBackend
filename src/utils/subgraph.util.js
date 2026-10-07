const axios = require('axios');
const env = require('../config/env');
const AppError = require('./AppError');

// graph-node caps `first` at 1000 per query.
const PAGE_SIZE = 1000;

/**
 * Runs one GraphQL query against the Goldsky subgraph.
 * @param {string} query
 * @param {object} [variables]
 */
async function query(query, variables = {}) {
  if (!env.SUBGRAPH_URL) throw new AppError('SUBGRAPH_URL is not configured', 503);

  let response;
  try {
    response = await axios.post(env.SUBGRAPH_URL, { query, variables }, { timeout: 20_000 });
  } catch (err) {
    throw new AppError(`Subgraph request failed: ${err.message}`, 502);
  }

  const { data, errors } = response.data || {};
  if (errors?.length) {
    throw new AppError(`Subgraph query failed: ${errors.map((e) => e.message).join('; ')}`, 502);
  }
  return data;
}

/**
 * Fetches every row of a list query by paging on `ordinal`, a strictly
 * increasing BigInt, rather than `skip` (which graph-node caps and which
 * slows down linearly).
 *
 * The query must take `$first: Int!` and `$after: BigInt!`, filter on
 * `ordinal_gt: $after`, order by `ordinal` ascending, and select `ordinal`.
 *
 * @param {string} gql
 * @param {string} field  top-level list field in the response
 * @param {object} [variables]
 */
async function queryAllByOrdinal(gql, field, variables = {}) {
  const rows = [];
  let after = '-1';
  for (;;) {
    const data = await query(gql, { ...variables, first: PAGE_SIZE, after });
    const page = data[field];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    after = page[page.length - 1].ordinal;
  }
}

/** Latest block the subgraph has indexed. */
async function getIndexedBlock() {
  const data = await query('{ _meta { hasIndexingErrors block { number timestamp } } }');
  return {
    number: data._meta.block.number,
    timestamp: Number(data._meta.block.timestamp),
    hasIndexingErrors: data._meta.hasIndexingErrors,
  };
}

module.exports = { query, queryAllByOrdinal, getIndexedBlock, PAGE_SIZE };
