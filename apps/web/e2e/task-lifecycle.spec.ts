import { test, expect } from "@playwright/test";

test("publish → claim → submit → revise → approve", async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const publisherContext = await browser.newContext();
  const workerContext = await browser.newContext();
  const publisher = await publisherContext.newPage();
  const worker = await workerContext.newPage();

  await publisher.goto("/register");
  await publisher.getByLabel(/用户名/).fill(`publisher-${suffix}`);
  await publisher.getByLabel(/显示名称/).fill("发布者 A");
  await publisher.getByLabel(/邮箱/).fill(`publisher-${suffix}@example.test`);
  await publisher.getByLabel(/^密码/).fill("StrongPass123!");
  await publisher.getByRole("button", { name: "注册并登录" }).click();
  await expect(publisher).toHaveURL(/dashboard/);

  await publisher.goto("/tasks/new");
  await publisher.getByLabel("任务标题").fill(`端到端整理任务 ${suffix}`);
  await publisher.getByLabel("一句话摘要").fill("这是一个用于验证完整任务状态闭环的测试任务。");
  await publisher.getByLabel("详细说明").fill("请按照任务要求提交一份清晰的测试成果，发布者会先退回修改再最终验收。");
  await publisher.getByLabel("要求标题").fill("提交测试说明");
  await publisher.getByLabel("具体内容").fill("成果中必须说明测试步骤和最终结果");
  await publisher.getByRole("button", { name: "保存并发布" }).click();
  await expect(publisher).toHaveURL(/\/tasks\/[a-f0-9-]+$/);
  const taskUrl = publisher.url();

  await worker.goto("/register");
  await worker.getByLabel(/用户名/).fill(`worker-${suffix}`);
  await worker.getByLabel(/显示名称/).fill("接取者 B");
  await worker.getByLabel(/邮箱/).fill(`worker-${suffix}@example.test`);
  await worker.getByLabel(/^密码/).fill("StrongPass123!");
  await worker.getByRole("button", { name: "注册并登录" }).click();
  await worker.goto(taskUrl);
  await worker.getByRole("button", { name: "接取任务" }).click();
  await worker.getByRole("button", { name: "开始任务" }).click();
  await worker.getByPlaceholder("描述成果内容、交付位置和注意事项").fill("第一版成果：已完成测试说明。");
  await worker.getByRole("button", { name: "提交成果" }).click();

  await publisher.reload();
  publisher.once("dialog", (dialog) => dialog.accept("请补充最终结果和复核记录"));
  await publisher.getByRole("button", { name: "要求修改" }).click();

  await worker.reload();
  await worker.getByPlaceholder("描述成果内容、交付位置和注意事项").fill("第二版成果：已补充最终结果和复核记录。");
  await worker.getByRole("button", { name: "提交成果" }).click();
  await publisher.reload();
  await publisher.getByRole("button", { name: "验收通过" }).first().click();
  await expect(publisher.getByText("已完成").first()).toBeVisible();

  await publisherContext.close();
  await workerContext.close();
});
