const fs = require('fs')
const path = require('path')
const spawn = require('child_process').spawn;
const rimraf = require('rimraf')
const Ora = require('ora')

const concatMap = (mapFn, xs) => xs.reduce((acc, el) => {
    return [...acc, ...mapFn(el)]
}, [])


const fromNullable = (x) => x ? Right(x) : Left()

// Either Type
const Right = x => ({
    map: f => Right(f(x)),
    chain: f => f(x),
    fold: (_, f) => f(x),
    inspect: () =>  `Right(${x})`
})

const Left = x => ({
    map: _ => Left(x),
    chain: _ => x,
    fold: (g, _) => g(x),
    inspect: () => `Left(${x})`
})


const isBootstrap = process.argv.indexOf('bootstrap') > -1
const isClean = process.argv.indexOf('clean') > -1
const isLink = process.argv.indexOf('link') > -1
const isExec = process.argv.indexOf('exec') > -1
const isAdd = process.argv.indexOf('add') > -1
const isRemove = process.argv.indexOf('remove') > -1

function readFlag(flag) {
    return process.argv[process.argv.indexOf(flag) + 1]
}


const packagesPath = path.resolve(process.cwd(), 'packages')

const findFolders = (dir) => {
    return fs.readdirSync(dir)
        .map(f => path.join(dir, f))
        .filter(f => !fs.statSync(f).isFile())
}

const getPackage = (dir) => {
    try {
        let pjson = fs.statSync(path.resolve(dir, 'package.json'))
        return [dir]
    } catch(e) {
        return concatMap(getPackage, findFolders(dir))
    }
}

const readFileContent = f => JSON.parse(fs.readFileSync(f, 'UTF-8'))
const cleanFileName = f => f.replace(path.join(packagesPath, '/'), '')

/**
 * 1) Get available packages
 */

const getPackageList = (packagesPath) => getPackage(packagesPath)
    // Ensure package names and replace dir fragment
    .map((f) => {
        try {
            let fileName = path.join(f, 'package.json')
            let parsed = readFileContent(fileName)
            let packageName = parsed.name
            let pathPackageName = cleanFileName(f)
            if (packageName === pathPackageName) {
                return pathPackageName
            } else {
                throw Error(packageName + ' should be ' + pathPackageName)
            }
        } catch(e) {
            console.error(e)
            throw Error('Error trying to parse ' + f)
        }
    })

/**
 * 2) Generate a dependency map between packages
 */

// availablePackages contains valid package names
// Now we are going to build a dependency map

const getPackageGlobal = (p) => readFileContent(path.resolve(packagesPath, p, 'package.json'))

const getDependencyMap = (packages) => packages.reduce((acc, p) => {
    // Read dependencies of this package for other packages
    let packageJsonDependencies = Object.keys(getPackageGlobal(p).linkDependencies || {})

    let result = packageJsonDependencies.filter(dep => {
        return packages.indexOf(dep) > -1
            ? true
            : false
    })

    return Object.assign(acc, {
        [p] : result
    })
}, {})



/**
 * 3) Find circular references
 */

const throwOnCircularDependency = (dependencyMap) => {
    Object.keys(dependencyMap).forEach(checkDependency)

    function checkDependency(dependency) {
        dependencyMap[dependency].forEach((otherDep) => {
            if (dependencyMap[otherDep].indexOf(dependency) > -1) {
                throw Error('Circular dependency found between ' + dependency + ' and ' + otherDep)
            }
        })
    }
}

/**
 * 4) Resolve package order
 */

const getPackageOrder = dependencyMap => {

    function findOrderRecursive(current, currentMap) {
        // Find a trivial dependency
        const toOrder = Object.keys(currentMap)
        const resolvedDep = toOrder.filter(o => currentMap[o].length === 0)[0]

        const nextList = [...current, resolvedDep]

        const nextMap = toOrder.reduce((acc, k) => {
            if (k !== resolvedDep) {
                acc[k] = currentMap[k].filter(d => d !== resolvedDep)
            }
            return acc
        }, {})

        if (Object.keys(nextMap).length === 0) {
            return nextList
        }

        return findOrderRecursive(nextList, nextMap)
    }

    return findOrderRecursive([], JSON.parse(JSON.stringify(dependencyMap)))
}

/**
 * 4) Check package versions versions
 */



/**
 * 5) Run side effects
 */

const availablePackages = getPackageList(packagesPath)
const dependencyMap = getDependencyMap(availablePackages)
throwOnCircularDependency(dependencyMap)
const packageOrder = getPackageOrder(dependencyMap)
const resolutions = packageOrder.map(x => [x, dependencyMap[x]])

function linkPackages() {

    // Store resolutions
    fs.writeFileSync(path.resolve('.', 'yarn-autolink.json'), JSON.stringify(dependencyMap, null, '  '))

    const execPromise = (packageDir, params) => () => new Promise((resolve) => {

        // Logging
        let spinner
        if (params.length === 1) {

            spinner = new Ora({
               text: "Creating a link for " + packageDir,
            })

        } else {
            spinner = new Ora({
               text: "Adding " + params[1] + " to " + packageDir,
            })
        }

        const child = spawn('yarn', params, {
            cwd: path.resolve(packagesPath, packageDir),
            // stdio: 'inherit'
        });

        spinner.start()

        child.on('close', () => {
            spinner.succeed()
            resolve()
        })

        child.on('error', () => {
            throw Error("Yarn seems not to be in yout PATH")
            spinner.fail()
        })

    })

    let executions = concatMap(([link, dependenciesToLink]) => {
        return [
            // A promise for linking the package
            execPromise(link, ['link'])
        ].concat(
            // Link deps of this package
            dependenciesToLink.map((link1) => execPromise(link, ['link', link1]))
        )

    } , resolutions)


    let series = executions.reduce((acc, next) => {
        return acc.then(() => next())
    }, Promise.resolve())

    series.then(() => {
        console.log("All links have been created!")
    })
}

if (isBootstrap) {

    function install(callback) {

        function installDeps() {
            // Run yarn in every package to install the dependencies
            Promise.all(resolutions.map(([packageDir]) => new Promise((resolve, reject) => {

                let spinner = new Ora({
                    text: 'Yarn is installing dependencies for ' + packageDir
                }).start()

                const child = spawn('yarn', [], {
                    cwd: path.resolve(packagesPath, packageDir),
                    // stdio: 'inherit'
                });

                child.on('close', () => {
                    spinner.succeed()
                    resolve()
                })

            }))).then(callback || function(){})
        }

        // let spinner = new Ora({
        //     text: 'Yarn is installing global package dependencies'
        // }).start()
        //
        // const child = spawn('yarn', [], {
        //     // cwd: path.resolve(packagesPath, packageDir),
        //     // stdio: 'inherit'
        // });
        //
        // child.on('close', () => {
        //     spinner.succeed()
        //     installDeps()
        // })

        installDeps()

    }

    install(linkPackages)

} else if (isClean) {

    // Clean links and node_modules directories

    resolutions.forEach(([packageDir]) => {

        let spinner = new Ora({
            text: 'Cleaning ' + packageDir
        }).start()

        const child = spawn('yarn', ['unlink'], {
            cwd: path.resolve(packagesPath, packageDir),
            // stdio: 'inherit'
        });

        child.on('close', () => {
            const dir = path.resolve('packages', packageDir, 'node_modules')
            rimraf(dir, function() {
                spinner.succeed()
            })
        })

    })

} else if (isLink) {
    linkPackages()

} else if (isExec) {

    let scope = readFlag('--scope')
    let script = readFlag('--script')

    if (!scope || !script) {
        throw Error('You must specify --scope and --script flags')
    }

    const child = spawn('yarn', [script], {
        cwd: path.resolve(packagesPath, scope),
        stdio: 'inherit'
    })

} else if (isAdd || isRemove) {

    const scope = readFlag('--scope')
    const isDev = process.argv.indexOf('--dev') > -1

    // Find which module to install
    const packageToAct =
        fromNullable(process.argv)
        .map(args => ['add', 'remove']
            .map(operation =>
                Right(args.indexOf(operation))
                    .chain(argIndex => argIndex > -1 ? fromNullable(args[argIndex + 1]) : Left('No index found'))
            )
        )
        .chain(xs => isAdd ? xs[0] : xs[1])
        .fold(
            function(e) { throw new Error(e) },
            x => x
        )

    if (!scope) {
        throw Error('You must specify --scope flag')
    }

    const parameters =  [ isAdd ? 'add' : 'remove'
                        , packageToAct
                        , ...(isDev ? ['--dev'] : [])
                        ]

    // console.log(parameters)

    const child = spawn('yarn', parameters, {
        cwd: path.resolve(packagesPath, scope),
        stdio: 'inherit'
    })

    child.on('error', (err) => console.error(`Check if packages/${scope} exists!`))
    child.on('close', () => {
        // Run autolink
        const autolinkBin = path.resolve('node_modules', 'yarn-autolink', 'bin', 'autolink')
        const child = spawn(autolinkBin, ['link'], {
            stdio: 'inherit'
        })
    })

} else {
    console.log(
`
yarn-autolink CLI tool

usage: autolink <command> [options]

commands:
    bootstrap                                Install node_modules for each package and run 'link' command too
    link                                     Resolve dependencies between modules and link them using yarn
    clean                                    Remove links and remove node_modules directories
    exec [--scope | --script]                Execute an NPM script in the scope of a package
                                                 example: autolink exec --scope @application/core --script start

    add|remove <package> [--scope | --dev ]  Install a package for for a specific scoped package and then links packages
                                                 example: autolink add babel-core --dev --scope @application/core

options:
    scope          The name of the package to act in the scope of
    script         Name of the NPM script to be executed
`
    )
}
