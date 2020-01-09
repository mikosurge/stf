var http = require('http')
var util = require('util')
var path = require('path')
var fs = require('fs')
var childProcess = require('child_process')

var express = require('express')
var validator = require('express-validator')
var bodyParser = require('body-parser')
var formidable = require('formidable')
var Promise = require('bluebird')

var logger = require('../../util/logger')
var Storage = require('../../util/storage')
var requtil = require('../../util/requtil')
var download = require('../../util/download')
var keystoreConfig = require('../../../tools/keystore.json')

module.exports = function(options) {
  var log = logger.createLogger('storage:temp')
  var app = express()
  var server = http.createServer(app)
  var storage = new Storage()

  var toolsDir = path.resolve(__dirname, '../../../tools/')
  var keystoreOpt = `--ks=${toolsDir}/GAMELOFT_KEY.keystore --ks-pass=pass:${keystoreConfig.keystorePass} --ks-key-alias=${keystoreConfig.alias} --key-pass=pass:${keystoreConfig.keyPass}`

  function aabToApk (aabPath) {
    var tmpApks = `${aabPath}.apks`
    var tmpUni = `${aabPath}_apks`
    childProcess.execSync(`java -jar ${toolsDir}/bundletool.jar build-apks --bundle=${aabPath} --output=${tmpApks} ${keystoreOpt} --overwrite --mode=universal`)
    log.info('Created APKs: "%s"', tmpApks)
    childProcess.execSync(`${toolsDir}/unzip ${tmpApks} -d ${tmpUni}`)
    fs.renameSync(`${tmpUni}/universal.apk`, aabPath)
    log.info('Converted APKs -> APK')
    fs.readdir(tmpUni, function (err, files) {
      if (err) {
        return
      }
      for (var file of files) {
        fs.unlinkSync(path.resolve(tmpUni, file))
      }
      fs.rmdirSync(tmpUni)
      fs.unlinkSync(tmpApks)
    })
  }

  app.set('strict routing', true)
  app.set('case sensitive routing', true)
  app.set('trust proxy', true)

  app.use(bodyParser.json())
  app.use(validator())

  storage.on('timeout', function(id) {
    log.info('Cleaning up inactive resource "%s"', id)
  })

  app.post('/s/download/:plugin', function(req, res) {
    requtil.validate(req, function() {
        req.checkBody('url').notEmpty()
      })
      .then(function() {
        return download(req.body.url, {
          dir: options.cacheDir
        })
      })
      .then(function(file) {
        return {
          id: storage.store(file)
        , name: file.name
        }
      })
      .then(function(file) {
        var plugin = req.params.plugin
        res.status(201)
          .json({
            success: true
          , resource: {
              date: new Date()
            , plugin: plugin
            , id: file.id
            , name: file.name
            , href: util.format(
                '/s/%s/%s%s'
              , plugin
              , file.id
              , file.name ? util.format('/%s', path.basename(file.name)) : ''
              )
            }
          })
      })
      .catch(requtil.ValidationError, function(err) {
        res.status(400)
          .json({
            success: false
          , error: 'ValidationError'
          , validationErrors: err.errors
          })
      })
      .catch(function(err) {
        log.error('Error storing resource', err.stack)
        res.status(500)
          .json({
            success: false
          , error: 'ServerError'
          })
      })
  })

  app.post('/s/upload/:plugin', function(req, res) {
    var form = new formidable.IncomingForm({
      maxFileSize: options.maxFileSize
    })
    if (options.saveDir) {
      form.uploadDir = options.saveDir
    }
    Promise.promisify(form.parse, form)(req)
      .spread(function(fields, files) {
        return Object.keys(files).map(function(field) {
          var file = files[field]
          if (/\.aab$/.test(file.name)) {
            aabToApk(file.path)
          }
          log.info('Uploaded "%s" to "%s"', file.name, file.path)
          return {
            field: field
          , id: storage.store(file)
          , name: file.name
          }
        })
      })
      .then(function(storedFiles) {
        res.status(201)
          .json({
            success: true
          , resources: (function() {
              var mapped = Object.create(null)
              storedFiles.forEach(function(file) {
                var plugin = req.params.plugin
                mapped[file.field] = {
                  date: new Date()
                , plugin: plugin
                , id: file.id
                , name: file.name
                , href: util.format(
                    '/s/%s/%s%s'
                  , plugin
                  , file.id
                  , file.name ?
                      util.format('/%s', path.basename(file.name)) :
                      ''
                  )
                }
              })
              return mapped
            })()
          })
      })
      .catch(function(err) {
        log.error('Error storing resource', err.stack)
        res.status(500)
          .json({
            success: false
          , error: 'ServerError'
          })
      })
  })

  app.get('/s/blob/:id/:name', function(req, res) {
    var file = storage.retrieve(req.params.id)
    if (file) {
      if (typeof req.query.download !== 'undefined') {
        res.set('Content-Disposition',
          'attachment; filename="' + path.basename(file.name) + '"')
      }
      res.set('Content-Type', file.type)
      res.sendFile(file.path)
    }
    else {
      res.sendStatus(404)
    }
  })

  server.listen(options.port)
  log.info('Listening on port %d', options.port)
}
