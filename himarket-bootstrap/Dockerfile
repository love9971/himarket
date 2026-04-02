FROM opensource-registry.cn-hangzhou.cr.aliyuncs.com/higress-group/dragonwell:17-standard-ga-anolis
WORKDIR /app

# 1. 修复 RPM 数据库冲突（解决 Operation not permitted）
# 2. 安装 Python 3.11 及其基础工具
# 3. 清理缓存以减小镜像体积
RUN rm -f /var/lib/rpm/__db.* && \
    dnf clean all && \
    dnf install -y python3.11 python3.11-pip python3.11-setuptools && \
    dnf clean all

# 设置环境变量，确保 Java 调用 'python3' 或 'pip3' 时指向 3.11 版本
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/pip3.11 /usr/bin/pip3

# (可选) 如果你的 Java 程序通过 'python' 命令调用，再加这一行：
RUN ln -sf /usr/bin/python3.11 /usr/bin/python

# 验证安装环境
RUN java -version && python3 --version && pip3 --version

COPY target/*.jar app.jar

# Install Arthas (download full package with fixed version)
# RUN ARTHAS_VERSION=4.1.4 && \
#     yum install -y unzip && \
#     mkdir -p /root/.arthas/lib/${ARTHAS_VERSION} && \
#     curl -L https://github.com/alibaba/arthas/releases/download/arthas-all-${ARTHAS_VERSION}/arthas-bin.zip -o /tmp/arthas-bin.zip && \
#     unzip /tmp/arthas-bin.zip -d /root/.arthas/lib/${ARTHAS_VERSION}/ && \
#     rm -f /tmp/arthas-bin.zip && \
#     yum clean all && \
#     curl -L https://arthas.aliyun.com/arthas-boot.jar -o /opt/arthas-boot.jar && \
#     echo '#!/bin/sh' > /usr/local/bin/as.sh && \
#     echo 'java -jar /opt/arthas-boot.jar "$@"' >> /usr/local/bin/as.sh && \
#     chmod +x /usr/local/bin/as.sh

EXPOSE 8080

# Set timezone (defaults to Asia/Shanghai, override via docker run -e TZ=...)
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Support reflection in java 17
ENV JAVA_OPTS="--add-opens java.base/java.util=ALL-UNNAMED --add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.lang.reflect=ALL-UNNAMED"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar --spring.profiles.active=prod"]