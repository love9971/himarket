package com.alibaba.himarket.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "skill")
public class SkillProperties {

    private String workDir;
}
