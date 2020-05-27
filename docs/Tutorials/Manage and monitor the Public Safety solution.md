# Monitor the solution

Here mockups of the main dashboards

Main Dashboards

### 1 -- Setup 

The setup tab shows a diagram with the various components and how they
interact.

It also has the commands to Add cameras. After the initial setup, no
additional setup should be required.

The only challenge is that the commands are part of the Edge LvaGateway
and won't hold through a template export/import.

![](media/image32.emf){width="6.5in" height="6.004861111111111in"}

### 2 -- Manage and Diagnosis

As a network or asset manager, I want to be able to quickly identify and
resolve infrastructure problems. I also want to ensure the Live Video
Analytic equipment is working and responding as expected. I have
pictures and properties to describe the assets.

I also see the lifecycle and functional details like the Graph
instantiation sequence.

And mainly, I see the health and the performance of the solution.

![](media/image33.emf){width="6.5in" height="3.4611111111111112in"}

### 3 -- Monitor

As a Security operator I want to quickly find anomalies on the security
streams. The solution is capable of detecting objects and motion to
trigger "Smart" event tagging.

I want to be able to quickly navigate through the events.

I want to see activity spikes to identify times when we have a problem.

![](media/image34.emf){width="6.5in" height="4.5159722222222225in"}

IoT Edge Running on an Intel NUC and Camera running on-prem
===========================================================

Steps
-----

1.  Create the Azure Media Services needed for this application

2.  Create an IoT Central Application from the template (it will not
    include the Edge Gateway)

3.  Follow the steps to create and associate the Edge Gateway with the
    downstream devices

4.  Grab the secrets for IoT Edge Provision

5.  Create a Linux IoT Edge on the Intel NUC

6.  Update the IoT Edge Agent's configuration to connect to the IoT
    Central App

7.  Run the IoT Edge device and monitor the deployment process and
    ensure all the modules are loaded

8.  Set up the desire properties and instantiate the Cameras, point the
    RTSP stream from the real camera

9.  Monitor the solution

[^1]: The LvaGatewayModule creates new direct connected Devices
    therefore select "Devices" instead of Azure Edge Devices

[^2]: The LvaGatewayModule generates symmetric device keys from the
    Group Master Key. This is a reference implementation, but for
    production environments you should build a provisioning strategy