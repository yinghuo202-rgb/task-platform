import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { ApiInterceptor } from "./common/api.interceptor";
import { requestContext } from "./common/request-context";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    rawBody: false,
  });
  app.setGlobalPrefix("api/v1");
  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.useGlobalInterceptors(new ApiInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  const http = app.getHttpAdapter().getInstance() as { set: (name: string, value: number | boolean) => void };
  http.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("多人任务平台 API")
    .setDescription("任务发布、接取、验收、通知和管理 REST API")
    .setVersion("1.0")
    .addCookieAuth("access_token")
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig), {
    customSiteTitle: "多人任务平台 API 文档",
  });

  const port = Number(process.env.APP_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  Logger.log(`API listening on ${port}`, "Bootstrap");
}

void bootstrap();
