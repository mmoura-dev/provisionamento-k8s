# -*- mode: ruby -*-
# vi: set ft=ruby :

server_ip = "192.168.56.10"

agents = { "k3s-agent-1" => "192.168.56.15",
           "k3s-agent-2" => "192.168.56.16" }

server_script = <<-SHELL

  export INSTALL_K3S_EXEC="--bind-address=#{server_ip} --node-ip=#{server_ip} --node-external-ip=#{server_ip}"

  curl -sfL https://get.k3s.io | sh -

  echo "Waiting for k3s server to be ready..."
  sleep 20

  # Share token and kubeconfig
  sudo mkdir -p /vagrant_shared
  sudo cp /var/lib/rancher/k3s/server/node-token /vagrant_shared/token
  sudo cp /etc/rancher/k3s/k3s.yaml /vagrant_shared/k3s.yaml
  sudo chmod 644 /vagrant_shared/*
SHELL

# Agent provisioning script
agent_script = <<-SHELL
  echo "Waiting for server token..."
  while [ ! -f /vagrant_shared/token ]; do
    sleep 5
  done

  TOKEN=$(cat /vagrant_shared/token)

  export K3S_URL="https://#{server_ip}:6443"
  export K3S_TOKEN="$TOKEN"

  curl -sfL https://get.k3s.io | sh -
SHELL

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"

  # Control-plane node
  config.vm.define "k3s-cp-1", primary: true do |server|
    server.vm.network "private_network", ip: server_ip
    server.vm.synced_folder "./shared", "/vagrant_shared"
    server.vm.hostname = "k3s-cp-1"

    server.vm.provider "virtualbox" do |vb|
      vb.memory = "2048"
      vb.cpus = "2"
    end

    server.vm.provision "shell", inline: server_script
  end

  # Agent nodes
  agents.each do |agent_name, agent_ip|
    config.vm.define agent_name do |agent|
      agent.vm.network "private_network", ip: agent_ip
      agent.vm.synced_folder "./shared", "/vagrant_shared"
      agent.vm.hostname = agent_name

      agent.vm.provider "virtualbox" do |vb|
        vb.memory = "2048"
        vb.cpus = "1"
      end

      agent.vm.provision "shell", inline: agent_script
    end
  end
end
