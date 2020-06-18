const { expect } = require('chai');
const sinon = require('sinon');
const { stubDocDBQuery, event, getContext } = require('../support');

const { viewerRequest } = require('../../lambdas/app');

const context = getContext('viewer-request');
const userPass = (user, pw) => (`Basic ${Buffer.from(`${user}:${pw}`).toString('base64')}`);

describe('viewerRequest', () => {
  afterEach(() => {
    sinon.restore();
  });


  it('basic auth disabled', async () => {
    const queryResults = {
      Count: 1,
      Items: [{ settings: {} }],
    };

    stubDocDBQuery(() => queryResults);
    const response = await viewerRequest(event, context);

    expect(response.headers['x-forwarded-host']).to.eq(undefined);
  });

  it('non-preview site - no basic auth', async () => {
    const username = 'testUser';
    const password = 'testPassword';
    const queryResults = {
      Count: 1,
      Items: [{ settings: { basic_auth: { username, password } } }],
    };

    stubDocDBQuery(() => queryResults);

    const response = await viewerRequest(event, context);

    expect(response.headers['x-forwarded-host']).to.eq(undefined);
  });

  it("password req'd - not present in request", async () => {
    const username = 'testUser';
    const password = 'testPassword';
    const queryResults = {
      Count: 1,
      Items: [{ settings: { basic_auth: { username, password } } }],
    };
    const authEvent = { ...event };
    authEvent.Records[0].cf.request.uri = '/preview/owner/repo/branch/index.html';
    stubDocDBQuery(() => queryResults);
    const response = await viewerRequest(authEvent, context);

    expect(response).to.deep.equal({
      status: '401',
      statusDescription: 'Unauthorized',
      body: 'Unauthorized',
      headers: {
        'www-authenticate': [
          {
            key: 'WWW-Authenticate',
            value: 'Basic',
          },
        ],
      },
    });
  });

  it('basic auth successful', async () => {
    const username = 'testUser';
    const password = 'testPassword';
    const queryResults = {
      Count: 1,
      Items: [{ settings: { basic_auth: { username, password } } }],
    };

    stubDocDBQuery(() => queryResults);

    const authEvent = { ...event };
    authEvent.Records[0].cf.request.headers.authorization = [{
      key: 'Authorization',
      value: userPass(username, password),
    }];

    const response = await viewerRequest(authEvent, context);

    expect(response.headers['x-forwarded-host'][0].key).to.equal('X-Forwarded-Host');
    expect(response.headers['x-forwarded-host'][0].value).to.equal(event.Records[0].cf.request.headers.host[0].value);
  });

  it("password req'd - invalid user password", async () => {
    const username = 'testUser';
    const password = 'testPassword';
    const queryResults = {
      Count: 1,
      Items: [{ settings: { basic_auth: { username, password } } }],
    };

    stubDocDBQuery(() => queryResults);

    const authEvent = { ...event };
    authEvent.Records[0].cf.request.headers.authorization = [{
      key: 'Authorization',
      value: 'invalidUserPassword',
    }];

    const response = await viewerRequest(authEvent, context);

    expect(response).to.deep.equal({
      status: '401',
      statusDescription: 'Unauthorized',
      body: 'Unauthorized',
      headers: {
        'www-authenticate': [
          {
            key: 'WWW-Authenticate',
            value: 'Basic',
          },
        ],
      },
    });
  });
});
