# yarn-autolink

> A tool for easily managing monorepos (multipackage packages)

## Why create another monorepo tool

[Lerna](https://lernajs.io/) and other tools exist that help you managing monorepos. `yarn-autolink`'s makes it a bit easier and uses yarn for everything under the hood.

yarn-autolink tries not to be prescriptive on how to develop your packages, like other alternatives out there do.

It's a tool for basically installing subpackage dependencies and creating and controlling links between them.

# Install

```
$ npm install --save-dev yarn-link
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

usage: autolink <command>

commands:
    bootstrap              Install node_modules for each package and run 'link' command too
    link                   Resolve dependencies between modules and link them using yarn
    clean                  Remove links and remove node_modules directories

```
