// @flow
import _ from 'lodash';
import {defaultConf, UPLINK_CONF} from '../../../src/lib/up-storage';
import AppConfig from '../../../src/lib/config';
// $FlowFixMe
import configExample from '../partials/config/index';
import type {Config, UpLinkConf} from '@verdaccio/types';
import type {IProxy} from '../../../types/index';
import {API_ERROR, HTTP_STATUS} from "../../../src/lib/constants";
import {mockServer} from './mock';
import {DOMAIN_SERVERS} from '../../functional/config.functional';
import {parseInterval} from '../../../src/lib/utils';

jest.mock('../../../src/lib/logger', () => ({
  logger: {
    child: jest.fn( () => (
      {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn()}
      )
    )
}}));

describe('UpStorge', () => {
  const mockServerPort: number = 55547;
  let mockRegistry;
  const uplinkDefault = {
    url: `http://0.0.0.0:${mockServerPort}`
  };
  const generateProxy = (config: UpLinkConf = uplinkDefault) => {
    const appConfig: Config = new AppConfig(configExample);

    const ProxyStorage = require('../../../src/lib/up-storage').default;
    return new ProxyStorage(config, appConfig);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  beforeAll(async () => {
    mockRegistry = await mockServer(mockServerPort).init();
  });

  afterAll(function(done) {
    mockRegistry[0].stop();
    done();
  });

  test('should be defined', () => {
    const proxy = generateProxy();

    expect(proxy).toBeDefined();
  });

  describe('UpStorge::uplinks properties', () => {
    test('should test default values', () => {
      const proxy = generateProxy();

      expect(proxy.maxage).toEqual(parseInterval(defaultConf[UPLINK_CONF.maxage]));
      expect(proxy.strictSSL).toEqual(defaultConf[UPLINK_CONF.strictSSL]);
      expect(proxy.fail_timeout).toEqual(parseInterval(defaultConf[UPLINK_CONF.failTimeout]));
      expect(proxy.max_fails).toEqual(defaultConf[UPLINK_CONF.maxFails]);
      expect(proxy.timeout).toEqual(parseInterval(defaultConf[UPLINK_CONF.timeout]));
    });

    test('should set properly maxage', () => {
      const proxy = generateProxy(_.assign({}, uplinkDefault, {
        maxage: '3m'
      }));

      expect(proxy.maxage).toEqual(parseInterval('3m'));
    });

    test('should set properly strict_ssl', () => {
      const proxy = generateProxy(_.assign({}, uplinkDefault, {
        strict_ssl: false
      }));

      expect(proxy.strictSSL).toEqual(false);
    });

    test('should set properly fail_timeout', () => {
      const proxy = generateProxy(_.assign({}, uplinkDefault, {
        fail_timeout: '1m'
      }));

      expect(proxy.fail_timeout).toEqual(parseInterval('1m'));
    });

    test('should set properly max_fails', () => {
      const proxy = generateProxy(_.assign({}, uplinkDefault, {
        max_fails: 100
      }));

      expect(proxy.max_fails).toEqual(100);
    });

    test('should set properly timeout', () => {
      const proxy = generateProxy(_.assign({}, uplinkDefault, {
        timeout: '10m'
      }));

      expect(proxy.timeout).toEqual(parseInterval('10m'));
    });
  });

  describe('UpStorge::getRemoteMetadata', () => {
    test('should be get remote metadata', (done) => {
      const proxy = generateProxy();

      proxy.getRemoteMetadata('jquery', {}, (err, data, etag) => {
        expect(err).toBeNull();
        expect(_.isString(etag)).toBeTruthy();
        expect(data.name).toBe('jquery');
        done();
      });
    });

    test('should be get remote metadata with etag', (done) => {
      const proxy = generateProxy();

      proxy.getRemoteMetadata('jquery', {etag: '123456'}, (err, data, etag) => {
        expect(err).toBeNull();
        expect(_.isString(etag)).toBeTruthy();
        expect(data.name).toBe('jquery');
        done();
      });
    });

    test('should be get remote metadata package does not exist', (done) => {
      const proxy = generateProxy();

      proxy.getRemoteMetadata('@verdaccio/fake-package', {etag: '123456'}, (err) => {
        expect(err).not.toBeNull();
        expect(err.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
        expect(err.message).toMatch(API_ERROR.NOT_PACKAGE_UPLINK);
        done();
      });
    });
  });


    describe('UpStorge::fetchTarball', () => {
      test('should fetch a tarball from uplink', (done) => {
        const infoMock = jest.fn();
        jest.doMock('../../../src/lib/logger', () => ({
          logger: {
            child: jest.fn( () => (
                {
                  info: infoMock
                }
              )
            )
        }}));
        const proxy = generateProxy();
        const tarball: string = `http://${DOMAIN_SERVERS}:${mockServerPort}/jquery/-/jquery-1.5.1.tgz`;
        const stream = proxy.fetchTarball(tarball);

        stream.on('error', function(err) {
          expect(err).toBeNull();
          done();
        });

        stream.on('content-length', function(contentLength) {
          expect(contentLength).toBeDefined();
          expect(infoMock).toHaveBeenCalled();
          expect(infoMock).toHaveBeenCalledTimes(1);
          // expect(infoMock).toHaveBeenCalledWith('dsds');
          done();
        });

      });

      test('should throw a 404 on fetch a tarball from uplink', (done) => {
        const proxy = generateProxy();
        const tarball: string = `http://${DOMAIN_SERVERS}:${mockServerPort}/jquery/-/no-exist-1.5.1.tgz`;
        const stream = proxy.fetchTarball(tarball);

        stream.on('error', function(err) {
          expect(err).not.toBeNull();
          expect(err.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
          expect(err.message).toMatch(API_ERROR.NOT_FILE_UPLINK);

          done();
        });

        stream.on('content-length', function(contentLength) {
          expect(contentLength).toBeDefined();
          done();
        });

      });

      test('should test the uplink is offline', (done) => {
        const infoMock = jest.fn();
        const warnMock = jest.fn();
        jest.doMock('../../../src/lib/logger', () => ({
          logger: {
            child: jest.fn( () => (
                {
                  info: infoMock,
                  warn: warnMock
                }
              )
            )
          }}));
        const proxy = generateProxy();
        // this url is fake
        const tarball: string = 'http://404.verdaccioo.com';
        const stream = proxy.fetchTarball(tarball);
        expect(proxy.failed_requests).toBe(0);
        //to test a uplink is offline we have to be try 3 times
        //the default failed request are set to 2
        stream.on('error', function(err) {
          expect(err).not.toBeNull();
          expect(err.statusCode).toBe('ENOTFOUND');
          expect(proxy.failed_requests).toBe(1);

          // we try a second time and should fails
          const streamSecondTry = proxy.fetchTarball(tarball);
            streamSecondTry.on('error', function(err) {
              expect(err).not.toBeNull();
              /*
                code: 'ENOTFOUND',
                errno: 'ENOTFOUND',
               */
              expect(err.statusCode).toBe('ENOTFOUND');
              expect(proxy.failed_requests).toBe(2);

              // we try a third time that should return an error
              const streamThirdTry = proxy.fetchTarball(tarball);
              streamThirdTry.on('error', function(err) {
                expect(err).not.toBeNull();
                expect(err.statusCode).toBe(HTTP_STATUS.INTERNAL_ERROR);
                expect(proxy.failed_requests).toBe(2);
                expect(err.message).toMatch(API_ERROR.UPLINK_OFFLINE);
                expect(warnMock).toHaveBeenCalled();
                expect(warnMock).toHaveBeenCalledTimes(1);
                expect(warnMock).toHaveBeenCalledWith({"host": `0.0.0.0:${mockServerPort}`}, "host @{host} is now offline");
                done();
              });
            });
        });
      });
    });

  describe('UpStorge::isUplinkValid', () => {
    describe('test valid use cases', () => {
      const validateUpLink = (
        url: string,
        tarBallUrl?: string = `${url}/artifactory/api/npm/npm/pk1-juan/-/pk1-juan-1.0.7.tgz`) => {
        const uplinkConf = { url };
        const proxy: IProxy = generateProxy(uplinkConf);

        return proxy.isUplinkValid(tarBallUrl);
      }

      test('should validate tarball path against uplink', () => {
        expect(validateUpLink('https://artifactory.mydomain.com')).toBe(true);
      });

      test('should validate tarball path against uplink case#2', () => {
        expect(validateUpLink('https://artifactory.mydomain.com:443')).toBe(true);
      });

      test('should validate tarball path against uplink case#3', () => {
        expect(validateUpLink('http://localhost')).toBe(true);
      });

      test('should validate tarball path against uplink case#4', () => {
        expect(validateUpLink('http://my.domain.test')).toBe(true);
      });

      test('should validate tarball path against uplink case#5', () => {
        expect(validateUpLink('http://my.domain.test:3000')).toBe(true);
      });

      // corner case https://github.com/verdaccio/verdaccio/issues/571
      test('should validate tarball path against uplink case#6', () => {
        // same protocol, same domain, port === 443 which is also the standard for https
        expect(validateUpLink('https://my.domain.test',
        `https://my.domain.test:443/artifactory/api/npm/npm/pk1-juan/-/pk1-juan-1.0.7.tgz`)).toBe(true);
      });

      test('should validate tarball path against uplink case#7', () => {
        expect(validateUpLink('https://artifactory.mydomain.com:5569')).toBe(true);
      });

      test('should validate tarball path against uplink case#8', () => {
        expect(validateUpLink('https://localhost:5539')).toBe(true);
      });
    });

    describe('test invalid use cases', () => {
      test('should fails on validate tarball path against uplink', () => {
        const url: string = 'https://artifactory.mydomain.com';
        const tarBallUrl: string = 'https://localhost/api/npm/npm/pk1-juan/-/pk1-juan-1.0.7.tgz';
        const uplinkConf = { url };
        const proxy: IProxy = generateProxy(uplinkConf);

        expect(proxy.isUplinkValid(tarBallUrl)).toBe(false);
      });

      test('should fails on validate tarball path against uplink case#2', () => {
        // different domain same, same port, same protocol
        const url = 'https://domain';
        const tarBallUrl = 'https://localhost/api/npm/npm/pk1-juan/-/pk1-juan-1.0.7.tgz';
        const uplinkConf = { url };
        const proxy: IProxy = generateProxy(uplinkConf);

        expect(proxy.isUplinkValid(tarBallUrl)).toBe(false);
      });

      test('should fails on validate tarball path against uplink case#3', () => {
        // same domain, diferent protocol, diferent port
        const url = 'http://localhost:5001';
        const tarBallUrl = 'https://localhost:4000/api/npm/npm/pk1-juan/-/pk1-juan-1.0.7.tgz';
        const uplinkConf = { url };
        const proxy: IProxy = generateProxy(uplinkConf);

        expect(proxy.isUplinkValid(tarBallUrl)).toBe(false);
      });

      test('should fails on validate tarball path against uplink case#4', () => {
        // same domain, same protocol, different port
        const url = 'https://subdomain.domain:5001';
        const tarBallUrl = 'https://subdomain.domain:4000/api/npm/npm/pk1-juan/-/pk1-juan-1.0.7.tgz';
        const uplinkConf = { url };
        const proxy: IProxy = generateProxy(uplinkConf);

        expect(proxy.isUplinkValid(tarBallUrl)).toBe(false);
      });

      test('should fails on validate tarball path against uplink case#5', () => {
        // different protocol, different domain, different port
        const url = 'https://subdomain.my:5001';
        const tarBallUrl = 'http://subdomain.domain:4000/api/npm/npm/pk1-juan/-/pk1-juan-1.0.7.tgz';
        const uplinkConf = { url };
        const proxy: IProxy = generateProxy(uplinkConf);

        expect(proxy.isUplinkValid(tarBallUrl)).toBe(false);
      });
    });

  });

});
