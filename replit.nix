{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.git
    pkgs.curl
    pkgs.wget
    pkgs.jq
    pkgs.unzip
  ];
}
