const fs   = require('fs')
const proc = require('child_process')

const each   = require('async').each
const utils  = require('nodeos-mount-utils')
const mkdirp = require('mkdirp')


const constants = fs.constants
const S_IX      = constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH

const flags     = utils.flags
const MS_BIND   = flags.MS_BIND
const MS_NOSUID = flags.MS_NOSUID


/**
 * Exec a command on a `chroot`ed directory with un-priviledged permissions
 */
function chrootSpawn(command, argv, opts, callback)
{
  argv = [opts.uid, opts.gid, command].concat(argv)

  const options =
  {
    cwd: opts.cwd,
    env: opts.env,
    stdio: 'inherit'
  }

  proc.spawn(`${__dirname}/chrootSpawn`, argv, options).on('exit', callback)
}

/**
 * This functions mounts the provided path to the device.
 * **If no device is available then it uses the type**
 * @access   private
 * @param    {Object}       info          This object holds information
 *                                        about the folder to create
 * @property {String}       info.dev      Device-File being mounted
 *                                        (located in `/dev`) a.k.a. devFile.
 * @property {String}       info.path     Directory to mount the device to.
 * @property {String}       info.type     Filesystem identificator
 *                                        (one of `/proc/filesystems`).
 * @property {Array|Number} info.[flags]  Flags for mounting
 * @property {String}       info.[extras] The data argument is
 *                                        interpreted by the different
 *                                        file systems. Typically it is a
 *                                        string of comma-separated options
 *                                        understood by this file system.
 * @param {Function}     callback         Function called after the
 *                                        mount operation finishes.
 *                                        Receives only one argument err.
 */
function mkdirMountInfo(info, callback)
{
  utils.mkdirMount(info.path, info.type, info.flags, info.extras, callback)
}


//
// Public API
//

function create(upperdir, callback)
{
  var workdir = upperdir.split('/')
  var user    = workdir.pop()
  var workdir = usersFolder.join('/')+'/.workdirs/'+user

  mkdirp(workdir, '0100', function(error)
  {
    if(error && error.code !== 'EEXIST') return callback(error)

    // Craft overlayed filesystem
    var type   = 'overlay'
    var extras =
    {
      lowerdir: '/',
      upperdir: upperdir,
      workdir : workdir
    }

    utils.mkdirMount(upperdir, type, MS_NOSUID, extras, function(error)
    {
      if(error) return callback(error)

      var arr =
      [
        {
          path: upperdir+'/dev',
          flags: MS_BIND,
          extras: {devFile: '/tmp/dev'}
        },
        {
          path: upperdir+'/proc',
          flags: MS_BIND,
          extras: {devFile: '/proc'}
        },
        {
          path: upperdir+'/tmp',
          type: 'tmpfs',
          flags: flags
        }
      ]

      each(arr, mkdirMountInfo, callback)
    })
  })
}

/**
 * Execute the command file
 *
 * @param {String}   home Path of the home folder where the command file is located
 * @param {String}   command Path of the command file inside the home folder
 * @param {String[]} [argv] Command arguments
 * @param {Object}   [env] Extra environment variables
 * @param {Function} callback Array of arguments
 */
function exec(home, command, argv, env, callback)
{
  if(!(argv instanceof Array))
  {
    callback = env
    env = argv
    argv = []
  }

  if(env instanceof Function)
  {
    callback = env
    env = null
  }

  env = env || {}
  env.__proto__ = process.env


  // get a stat of the home folder
  fs.stat(home, function(error, homeStat)
  {
    if(error)
    {
      // Return every error but no ENOENT
      if(error.code !== 'ENOENT') return callback(error)

      return callback(`${home} not found`)
    }

    // path to the command file
    const commandPath = `${home}${command}`

    fs.stat(commandPath, function(error, commandStat)
    {
      if(error)
      {
        // Return every error but no ENOENT
        if(error.code !== 'ENOENT') return callback(error)

        return callback(`${commandPath} not found`)
      }

      // check if the command file is an actual file
      if(!commandStat.isFile())
        return callback(`${commandPath} is not a file`)

      // check if the command file uid & gid are the same of its parent folder
      if(homeStat.uid !== commandStat.uid || homeStat.gid !== commandStat.gid)
        return callback(`${home} uid & gid don't match with ${command}`)

      // check if the command file is executable
      if(!(commandStat.mode & S_IX))
        return callback(`${command} is not executable`)

      // Exec command
      const options =
      {
        cwd: home,
        env: env,
        uid: homeStat.uid,
        gid: homeStat.gid
      }

      chrootSpawn(command, argv, options, callback)
    })
  })
}

function run(home, command, argv, env, callback)
{
  create(home, function(error)
  {
    if(error) return callback(error)

    exec(home, command, argv, env, callback)
  })
}


exports.create = create
exports.exec   = exec
exports.run    = run
