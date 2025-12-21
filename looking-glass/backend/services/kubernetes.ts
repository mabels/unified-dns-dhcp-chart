// Kubernetes kubectl exec wrapper using Deno.Command

export interface KubectlExecOptions {
  namespace: string;
  pod: string;
  container: string;
  command: string[];
  context?: string;
}

export interface KubectlExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export async function kubectlExec(options: KubectlExecOptions): Promise<KubectlExecResult> {
  const { namespace, pod, container, command, context } = options;

  const args = ["exec", "-n", namespace, pod, "-c", container];

  if (context) {
    args.unshift("--context=" + context);
  }

  args.push("--");
  args.push(...command);

  const cmd = new Deno.Command("kubectl", { args });

  try {
    const { stdout, stderr, code } = await cmd.output();

    return {
      success: code === 0,
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr),
      code,
    };
  } catch (error) {
    return {
      success: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      code: -1,
    };
  }
}
