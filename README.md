# yarn-autolink

> A tool for easily managing monorepos (multipackage packages)

## Why create another monorepo tool

[Lerna](https://lernajs.io/) and other tools exist that help you managing monorepos. `yarn-autolink`'s makes it a bit easier and uses yarn for everything under the hood.

yarn-autolink tries not to be prescriptive on how to develop your packages, like other alternatives out there do.

It's a tool for basically installing subpackage dependencies and creating and controlling links between them.

# Install

```
$ npm install --save-dev yarn-autolink
```

## Configuration

To create a monorepo:

- Install yarn-link

- Setup a structure like this:

```
root
    |
     - package.json
     - packages
               |
               - package1
                         |
                         - package.json
               - package2
                         |
                         - package.json
```

Each package will define a section in it's package.json for defining it's dependencies between local packages

- Add linkDependencies to you packages
```
"name": "beta",
"version": "1.0.0"
"linkDependencies": {
      "alpha": "1.0.0"
}
```

Thats enough to start working by doing `autolink bootstrap`

## CLI Usage

```
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
```

## Examples

There's an example folder in this repo but I encourage you to have a look on how to configure a React application with a storybook using a monorepo in this [link](https://github.com/aitoroses/monorepo-starter).
