module.exports = function ExplorerCtrl($scope) {
  $scope.explorer = {
    search: '',
    files: [],
    paths: []
  }

  $scope.getAbsolutePath = function() {
    return ('/' + $scope.explorer.paths.join('/')).replace(/\/\/+/g, '/')
  }

  function resetPaths(path) {
    $scope.explorer.paths = path.split('/')
  }

  var listDir = function listDir() {
    var path = $scope.getAbsolutePath()
    $scope.explorer.search = path

    $scope.control.fslist(path)
      .then(function(result) {
        $scope.explorer.files = result.body
        $scope.$digest()
      })
      .catch(function(err) {
        throw new Error(err.message)
      })
  }

  $scope.dirEnterLocation = function() {
    if ($scope.explorer.search) {
      resetPaths($scope.explorer.search)
      listDir()
      $scope.explorer.search = $scope.getAbsolutePath()
    }
  }

  $scope.dirEnter = function(name) {
    if (name) {
      $scope.explorer.paths.push(name)
    }
    listDir()
    $scope.explorer.search = $scope.getAbsolutePath()
  }

  $scope.dirUp = function() {
    if ($scope.explorer.paths.length !== 0) {
      $scope.explorer.paths.pop()
    }
    listDir()
    $scope.explorer.search = $scope.getAbsolutePath()
  }

  $scope.getFile = function(file) {
    var path = $scope.getAbsolutePath() + '/' + file
    $scope.control.fsretrieve(path)
      .then(function(result) {
        if (result.body) {
          location.href = result.body.href + '?download'
        }
      })
      .catch(function(err) {
        alert(err.message)
        throw new Error(err.message)
      })
  }

  $scope.uploadFile = function($files) {
    if ($files.length) {
      var reader = new FileReader()
      reader.onload = function(evt) {
        var path = $scope.getAbsolutePath() + '/' + $files[0].name
        $scope.control.fsupload(evt.target.result, path)
          .then(function(result) {
            listDir()
            $scope.explorer.search = $scope.getAbsolutePath()
          })
          .catch(function(err) {
            alert(err.message)
            throw new Error(err.message)
          })
      }
      reader.readAsDataURL($files[0])
    }
  }

  const fileSelector = document.createElement('input')
  fileSelector.setAttribute('type', 'file')

  $scope.uploadFileDialog = function() {
    fileSelector.onchange = function() {
      $scope.uploadFile(fileSelector.files)
    }
    fileSelector.value = ''
    fileSelector.click()
  }

  // Initialize
  listDir($scope.dir)
}
