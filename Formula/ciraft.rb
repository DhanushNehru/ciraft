class Ciraft < Formula
  desc "Auto-generate production-grade CI/CD pipelines from your codebase in seconds"
  homepage "https://github.com/DhanushNehru/ciraft"
  url "https://registry.npmjs.org/ciraft/-/ciraft-1.0.0.tgz"
  sha256 "bbeab91aed3aa24986f2f742bff77b3679c3bd6a1f2c6a8168bd1e24a2f65bb1"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/ciraft", "--help"
  end
end
