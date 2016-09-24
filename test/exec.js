'use strict'

var fs   = require('fs')
var proc = require('child_process')

var chai       = require('chai')
var Error      = require('errno-codes')
var proxyquire = require('proxyquire')
var sinon      = require('sinon')
var sinonChai  = require('sinon-chai')

var jocker = require('..')

var should  = chai.should()
var plugins = {sinon: sinonChai}

chai.use(plugins.sinon)


describe('exec', function () {

  // errors
  var UNKNOWN = Error.get(Error.UNKNOWN)
  var ENOENT  = Error.get(Error.ENOENT)
  var ENOTDIR = Error.get(Error.ENOTDIR)

  it('should be a function', function () {
    jocker.exec.should.be.a.function
  })
  it('should make stat call for the HOME argument', sinon.test(function () {
    var stat     = this.spy(fs, 'stat')
    var callback = this.spy()

    jocker.exec('/home', '/init', callback)

    stat.should.have.been.calledWithExactly('/home', sinon.match.func)
  }))
  it('should return every error excluding ENOENT on homeStat', sinon.test(function () {
    var stat = this.stub(fs, 'stat')
    var callback = this.spy()

    stat.withArgs('/home', sinon.match.func).yields(UNKNOWN)

    jocker.exec('/home', '/init', callback)

    callback.should.have.been.calledWith(UNKNOWN)
  }))
  it('should return "path not found" for ENOENT errors', sinon.test(function () {
    var stat = this.stub(fs, 'stat')
    var callback = this.spy()

    stat.withArgs('/home', sinon.match.func).yields(ENOENT)

    jocker.exec('/home', '/init', callback)

    callback.should.have.been.calledWithExactly(`/home not found`)
  }))
  it('should make a stat call for the init file', sinon.test(function () {
    var stat     = this.stub(fs, 'stat')
    var callback = this.spy()

    stat.withArgs('/home', sinon.match.func).yields(null, {isFile: sinon.stub().returns(false)})
    stat.withArgs('/home/init', sinon.match.func).yields(null, {isFile: sinon.stub().returns(true)})

    jocker.exec('/home', '/init', callback)

    stat.should.have.been.calledWithExactly('/home', sinon.match.func)
    stat.should.have.been.calledWithExactly('/home/init', sinon.match.func)
  }))
  it('should return every error excluding ENOENT on initStat', sinon.test(function () {
    var stat     = this.stub(fs, 'stat')
    var callback = this.spy()

    stat.withArgs('/home', sinon.match.func).yields(null, {isFile: sinon.stub().returns(false)})
    stat.withArgs('/home/init', sinon.match.func).yields(UNKNOWN)

    jocker.exec('/home', '/init', callback)

    callback.should.have.been.calledWith(UNKNOWN)
  }))
  it('should return "path not found" for ENOENT errors', sinon.test(function () {
    var stat     = this.stub(fs, 'stat')
    var callback = this.spy()

    stat.withArgs('/home', sinon.match.func).yields(null, {isFile: sinon.stub().returns(false)})
    stat.withArgs('/home/init', sinon.match.func).yields(ENOENT)

    jocker.exec('/home', '/init', callback)

    callback.should.have.been.calledWithExactly(`/home/init not found`)
  }))
  it('should check if the init stat is a file and return the callback with an error', sinon.test(function () {
    var homeStat = { gid: 0, uid: 0 }
    var initStat = { gid: undefined, uid: undefined, isFile: sinon.stub().returns(false) }

    var stat     = this.stub(fs, 'stat')
    var callback = this.spy()

    stat.withArgs('/home', sinon.match.func).yields(null, homeStat)
    stat.withArgs('/home/init', sinon.match.func).yields(null, initStat)

    jocker.exec('/home', '/init', callback)

    initStat.isFile.should.have.been.calledOnce
    callback.should.have.been.calledWithExactly('/home/init is not a file')
  }))
  it('should check if the home stat and the init stat have the same gid uid', sinon.test(function () {
    var homeStat = { gid: 0, uid: 0 }
    var initStat = { gid: 1, uid: 1, isFile: sinon.stub().returns(true) }

    var stat     = this.stub(fs, 'stat')
    var callback = this.spy()

    stat.withArgs('/home', sinon.match.func).yields(null, homeStat)
    stat.withArgs('/home/init', sinon.match.func).yields(null, initStat)

    jocker.exec('/home', '/init', callback)

    callback.should.have.been.calledWithExactly("/home uid & gid don't match with /init")
  }))
  it('should spawn the user init script', sinon.test(function () {
    var chrootSpawn = `${process.cwd()}/lib/chrootSpawn`
    var context    = { on: sinon.stub() }

    var callback = this.spy()

    var stat     = this.stub(fs, 'stat')
    var spawn    = this.stub(proc, 'spawn')
    var homeStat = { gid: 0, uid: 0 }
    var initStat = { gid: 0, uid: 0, mode: fs.constants.S_IXUSR,
                     isFile: sinon.stub().returns(true) }

    stat.withArgs('/home', sinon.match.func).yields(null, homeStat)
    stat.withArgs('/home/init', sinon.match.func).yields(null, initStat)

    context.on.withArgs('exit', callback).returns()
    spawn.withArgs(chrootSpawn, [homeStat.uid, homeStat.gid, '/init'],
                   {cwd: '/home', env: {}, stdio: 'inherit'})
         .returns(context)

    jocker.exec('/home', '/init', callback)

    spawn.should.have.been.calledWithExactly(chrootSpawn,
        [homeStat.uid, homeStat.gid, '/init'],
        {cwd: '/home', env: {}, stdio: 'inherit'})
    spawn.should.have.returned(context)
    context.on.should.have.been.calledOnce
  }))
})
