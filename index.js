const fs = require('fs')
const path = require('path')
const spawn = require('child_process').spawn;


const concatMap = (mapFn, xs) => xs.reduce((acc, el) => {
    return [...acc, ...mapFn(el)]
}, [])

const isBootstrap = process.argv.indexOf('bootstrap')
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

const getDependencyMap = (packages) => packages.reduce((acc, p) => {
    // Read dependencies of this package for other packages
    let packageJsonDependencies = Object.keys(readFileContent(path.resolve(packagesPath,p, 'package.json'))
        .dependencies || {})

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

if (isBootstrap > -1) {
    const availablePackages = getPackageList(packagesPath)
    const dependencyMap = getDependencyMap(availablePackages)
    throwOnCircularDependency(dependencyMap)
    const packageOrder = getPackageOrder(dependencyMap)

    const resolutions = packageOrder.map(x => [x, dependencyMap[x]])

    // Store resolutions
    fs.writeFileSync(path.resolve('.', '.autolink'), JSON.stringify(dependencyMap, null, '  '))

    const execPromise = (packageDir, params) => () => new Promise((resolve) => {

        // Logging
        if (params.length === 1) {
            console.log("Creating a link for " + packageDir)
        } else {
            console.log("Adding " + params[1] + " to " + packageDir)
        }

        // Create
        const child = spawn('yarn', params, {
            cwd: path.resolve(packagesPath, packageDir),
            // stdio: 'inherit'
        });

        child.on('close', () => resolve())
        child.on('error', () => { throw Error("Yarn seems not to be in yout PATH") })

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
        console.log("End!")
    })


}
