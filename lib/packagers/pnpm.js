'use strict';
/**
 * PNPM packager.
 * 
 * PNPM specific packagerOptions (default):
 *   flatTree (false) - Use --flatTree with install
 *   ignoreScripts (false) - Do not execute scripts during install
 */

const _ = require('lodash');
const BbPromise = require('bluebird');
const Utils = require('../utils');

class PNPM {
  static get lockfileName() {  // eslint-disable-line lodash/prefer-constant
    return 'shrinkwrap.yaml';
  }

  static get copyPackageSectionNames() {
    return ['resolutions'];
  }

  static get mustCopyModules() {  // eslint-disable-line lodash/prefer-constant
    return false;
  }

  static getProdDependencies(cwd, depth) {
    const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
    const args = [
      'list',
      `--depth=${depth || 1}`,
      '--parseable',
      '--production'
    ];
	
    // If we need to ignore some errors add them here
    const ignoredPNPMErrors = [];

    return Utils.spawnProcess(command, args, {
      cwd: cwd
    })
    .catch(err => {
      if (err instanceof Utils.SpawnError) {
        // Only exit with an error if we have critical npm errors for 2nd level inside
        const errors = _.split(err.stderr, '\n');
        const failed = _.reduce(errors, (failed, error) => {
          if (failed) {
            return true;
          }
          return !_.isEmpty(error) && !_.some(ignoredPNPMErrors, ignoredError => _.startsWith(error, `npm ERR! ${ignoredError.npmError}`));
        }, false);

        if (!failed && !_.isEmpty(err.stdout)) {
          return BbPromise.resolve({ stdout: err.stdout });
        }
      }

      return BbPromise.reject(err);
    })
    .then(processOutput => processOutput.stdout);
  }

  static rebaseLockfile(pathToPackageRoot, lockfile) {
    const fileVersionMatcher = /[^"/]@(?:file:)?((?:\.\/|\.\.\/).*?)[":,]/gm;
    const replacements = [];
    let match;
    
    // Detect all references and create replacement line strings
    while ((match = fileVersionMatcher.exec(lockfile)) !== null) {
      replacements.push({
        oldRef: match[1],
        newRef: _.replace(`${pathToPackageRoot}/${match[1]}`, /\\/g, '/')
      });
    }

    // Replace all lines in lockfile
    return _.reduce(replacements, (__, replacement) => {
      return _.replace(__, replacement.oldRef, replacement.newRef);
    }, lockfile);
  }

  static install(cwd, packagerOptions) {
    const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
    const args = [
      'install',
      '--non-interactive'
    ];

    // Convert supported packagerOptions
    if (packagerOptions.ignoreScripts) {
	args.push('--ignore-scripts');
	}

    return Utils.spawnProcess(command, args, { cwd })
    .return();
  }

  // "PNPM install" prunes automatically
  static prune(cwd, packagerOptions) {
    return PNPM.install(cwd, packagerOptions);
  }

  static runScripts(cwd, scriptNames) {
    const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
    return BbPromise.mapSeries(scriptNames, scriptName => {
      const args = [
        'run',
        scriptName
      ];

      return Utils.spawnProcess(command, args, { cwd });
    })
    .return();
  }
}

module.exports = PNPM;
