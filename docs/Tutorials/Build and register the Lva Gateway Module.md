# Build the Lva Gateway Modules

## Clone the repo

https://github.com/sseiber/lva-gateway
Populate the deployment manifest and local JSON files from setup
Move to the repo folder

1. The first time after cloning the repo run the command **npm install** from the VSCode Terminal (this will execute setup scripts and populate the ./configs directory)

    1. Locate and delete the `nodes_module` folder if you merge the master branch again

1. Make a copy of ./setup/deployment.amd64.json and copy it to ./storage

## Edit the ./storage/deployment.amd64.json file

1. on portal.azure.com create a container register (or use your own)
1. edit the `registryCredentials` section and add your container registry
1. edit the `LvaEdgeGatewayModule` module section and add your image name and your AMS account name int the `env:amsAccountName:value`
1. edit the `lvaYolov3` module section and add your image name
1. edit the `lvaEdge` module section and add your image name
1. on portal.azure.com create an Azure Media Services account
1. use the `API access` tab and copy the information there to the deployment file in the `lvaEdge:properties.desired` section

## Build the code

run the command **npm version patch** but before it is a good practice to reload all the VSCode Services. Use the Command Pallet and call `Developer: Reload Window`

1. The build scripts deploy the images to the `Registry Container`, therefore you need to login into docker using
`docker login [your server].azurecr.io`. You have to provide username and password (Use the same credentials that you provided in the deployment manifest for the modules)

1. The output traces in VSCode Terminal show success or failure.

1. The version for the `LvaEdgeGatewayModule` image increments every time the build completes
You need to use this version for the deployment manifest.
