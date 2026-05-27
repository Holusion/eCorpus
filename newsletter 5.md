Delivered-To: t.guillaumont@holusion.com
Received: by 2002:a05:7300:8c9e:b0:2ae:533d:19ba with SMTP id y30csp2538429dyr; Tue, 20 Jan 2026 06:41:44 -0800 (PST)
X-Forwarded-Encrypted: i=3; AJvYcCU6X+yCrxiynEJZO89qjODJlKibULJVpOKxy54huJjSSWfb36DaInq4LXVD7fFhbp8nNQiqgjSdgsMhwoOh@holusion.com
X-Received: by 2002:a05:6000:2486:b0:432:dfea:1fa8 with SMTP id ffacd0b85a97d-4358ff300f1mr3096612f8f.45.1768920103751; Tue, 20 Jan 2026 06:41:43 -0800 (PST)
ARC-Seal: i=2; a=rsa-sha256; t=1768920103; cv=fail; d=google.com; s=arc-20240605; b=ZO76sU89QCgMTL9jlSFwsJpB47L+8L90YrS5JeZFh+yYVnpQ27tsJ6/aX7EC3KtDPt QDJPnFnXfpbc+OL9z2BXmWBezXLvsgokLZJVWR9TCONuU2exMW6EOkTECycsOTtuqGbI DATF5+BskXPAB+XztyQxdHiSJl93hoJT9mNh4iuVvGRac9umdEqdlhYXCeqf9sJAXg+A BCzthFBgtj2BUQRlx4uWnZeQSVmhgzxeeBZh+x22cWG05GpYeoB5v1UvpBMUqfjlR+CZ Umua7Ftb6zfQibosvP1D3JY7ml65nSQby+wvQW4qrRXZYH61rlL4xn/oM5rZs/4VGKBG +roQ==
ARC-Message-Signature: i=2; a=rsa-sha256; c=relaxed/relaxed; d=google.com; s=arc-20240605; h=archived-at:list-archive:list-owner:list-post:list-unsubscribe :list-subscribe:list-help:list-id:sender:precedence:precedence :errors-to:reply-to:subject:to:message-id:date:from:mime-version :delivered-to:dkim-signature; bh=y9IC8ZXz6aLpyGfzigXe447Rz8SIJvuQp2L7EUEWph8=; fh=MnIJDc/LbrLtE5e/s9WAuABv/ApfwUa6eor4612tNhQ=; b=QLg93U5WOO9ew9PV+xMmibRWnK8LTdUG7zMp8qFhBBpD4VCc8EfQOQVmEeZHzlV92V at9V8sR56ePLehroTuLU+aMH6RKDbYX7YBfGCMW3/3MWQOuo7TytzYnuKKMIE7tDEwDZ eoHPH3LOVPpLW9UxTqP6oxWzY6KPhYwN9OrnFypi8s7Ox2sD8ogGcsekKlu5ROL6VRyr X9IHOuJ9105jMOWlGZQ4SFW5+rxPRvJDfVJjcpz4CIugvE5S36bMw/s7FbnyF3FMdEV8 XrWsuiQfgUge5Cx+quZQysjB/qDHKY925HYsgukp2eMpb9A37S2c/xicPuGI5yWWSSNH mvQg==; dara=google.com
ARC-Authentication-Results: i=2; mx.google.com; dkim=pass header.i=@framagroupes.org header.s=dkim3 header.b=btMzWME9; arc=fail (body hash mismatch); spf=pass (google.com: domain of ethesaurus_social_club-owner@framagroupes.org designates 2a01:4f8:13b:b5f::2 as permitted sender) smtp.mailfrom=ethesaurus_social_club-owner@framagroupes.org; dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=framagroupes.org; dara=neutral header.i=@holusion.com
Return-Path: <ethesaurus_social_club-owner@framagroupes.org>
Received: from julio.framasoft.org (julio.framasoft.org. [2a01:4f8:13b:b5f::2]) by mx.google.com with ESMTPS id ffacd0b85a97d-435699961dfsi20195664f8f.172.2026.01.20.06.41.43 for <t.guillaumont@holusion.com> (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256); Tue, 20 Jan 2026 06:41:43 -0800 (PST)
Received-SPF: pass (google.com: domain of ethesaurus_social_club-owner@framagroupes.org designates 2a01:4f8:13b:b5f::2 as permitted sender) client-ip=2a01:4f8:13b:b5f::2;
Authentication-Results: mx.google.com; dkim=pass header.i=@framagroupes.org header.s=dkim3 header.b=btMzWME9; arc=fail (body hash mismatch); spf=pass (google.com: domain of ethesaurus_social_club-owner@framagroupes.org designates 2a01:4f8:13b:b5f::2 as permitted sender) smtp.mailfrom=ethesaurus_social_club-owner@framagroupes.org; dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=framagroupes.org; dara=neutral header.i=@holusion.com
Received: by julio.framasoft.org (Postfix, from userid 1004) id 4dwVQH10kMz26hL1; Tue, 20 Jan 2026 15:41:41 +0100 (CET)
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=framagroupes.org; s=dkim3; t=1768920103; h=from:from:sender:sender:reply-to:reply-to:subject:subject:date:date: message-id:message-id:to:to:cc:mime-version:mime-version: content-type:content-type:list-id:list-help:list-owner: list-unsubscribe:list-subscribe:list-post; bh=y9IC8ZXz6aLpyGfzigXe447Rz8SIJvuQp2L7EUEWph8=; b=btMzWME9kRltbbIYmz6PO/9HbYnBIV6frti7C8SXFEfFrijhlOlZImuq/GYBu/xmF43Ecb 6rvs07psfN8bDcVrZjuZTrSQvJUW6guwHR0ZrRasT65wA8DGvHzTBm957T3XgJu8c1JDTw scqjJ8myQFEh/GTHu+8/2zESddw3oh5c7RXWjbYvZRHbdZfFzwH4P9c+8iunA7ustLhSkr lraY3kBICJSBT53jPEp+lU5LgdvCCGf6w0ynRauuPS4lzrZ+gDvSo4LNrAkz13+J8NuoqH GyisyRsbYSAYGnNfsyh0uRxe1qqj68WjZIHPfNyOmV7v6JScdHRA4AeAf02eqw==
Authentication-Results: julio.framasoft.org; none
X-Original-To: ethesaurus_social_club@framagroupes.org
Delivered-To: ethesaurus_social_club@framagroupes.org
Received: from mail-ua1-x92b.google.com (mail-ua1-x92b.google.com [IPv6:2607:f8b0:4864:20::92b]) (using TLSv1.3 with cipher TLS_AES_128_GCM_SHA256 (128/128 bits) key-exchange X25519 server-signature RSA-PSS (4096 bits) server-digest SHA256) (No client certificate requested) by julio.framasoft.org (Postfix) with ESMTPS id 4dwVQ42GWzz26hLv for <ethesaurus_social_club@framagroupes.org>; Tue, 20 Jan 2026 15:41:32 +0100 (CET)
Received: by mail-ua1-x92b.google.com with SMTP id a1e0cc1a2514c-947fef8ebf4so649774241.0 for <ethesaurus_social_club@framagroupes.org>; Tue, 20 Jan 2026 06:41:32 -0800 (PST)
ARC-Seal: i=1; a=rsa-sha256; t=1768920091; cv=none; d=google.com; s=arc-20240605; b=XM4I7De4Sr+XEYeD29dPQkzbpf/Wmwb+LzIZ/Oxk9yc+JsS+JU+gugMZZQBcQrLTcq 3QsvdtnNEYRJO7Iy5GNC5w9XgIXdudxYOV8hTwINpPUaQAOV7xasmMYim+tPlSys9Sgm nTq+u0oVTsP57kwxJ7Oo/bznxsrrt+E4XHaZx1XsBzf3kYaRegA9stBMlXewsxCHXjFj DOp49jlyFZSOMLbOF1W6lACTHHwPcHTUpvf4B2hAtQ8sxiv9792rEQWywu3YhRr06yNG yexFsiKQ7zircwsh53YSuxvUk+7FprJQI9PT6CTEa5EbnD65Y91qJWfIyvtk8cDHQ4y9 5tHg==
ARC-Message-Signature: i=1; a=rsa-sha256; c=relaxed/relaxed; d=google.com; s=arc-20240605; h=to:subject:message-id:date:from:mime-version:dkim-signature; bh=F4uuJDfhv8SKgtkeckZg45Umqp9m0RjictlSleXo9PQ=; fh=MnIJDc/LbrLtE5e/s9WAuABv/ApfwUa6eor4612tNhQ=; b=MJrEAB3ajxLrlkcvGo0tyAPZAMNihWabV2Chwibl44Uw5lfSNFUrBRFWPbHlbCauDN SZ+KbuAAh4lukMvFFn8cGT50KJF4byd7yFrFBR/vtBJ8S+cfOg7/2CnJ2WGhpWahT8hr OjI6w8lWmwIA2IW9t5/J0TmYZqP4Xky8bj3f63fFZIY9x5oSU0bwAgcq5NfXW1o409WR OcJJx/bSAXI3jt60avYcuV18hvv0oKp8WIwFKHjXu7hU44vJ6/U3nbcDtT3Og5PUAHy4 u/0k9hSSm2kflZZlzEO1q/wjqTL2rqeiVwu0TTm6/cYk0zzLXu3Qg8Z31nsofy12yHEW G9EA==; darn=framagroupes.org
ARC-Authentication-Results: i=1; mx.google.com; arc=none
X-Google-DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=1e100.net; s=20230601; t=1768920091; x=1769524891; h=to:subject:message-id:date:from:mime-version:x-gm-gg :x-gm-message-state:from:to:cc:subject:date:message-id:reply-to; bh=F4uuJDfhv8SKgtkeckZg45Umqp9m0RjictlSleXo9PQ=; b=WZgRYL0pvjDvntqF3wmrgCt03Ch+JhpzT3ZUS3Tr8iQ4XYrUHyUWElKi8tije5T5HW gCcPSIU04kjLgyDtWL41xbvJvuW6Eppp66d2wrVVlI99U3E8npdmsMZ/EiRRnUpWu+Uk Inu0ABwQSs63OxiKgYIBOyiy25YkvGHCucqm18L5ZPN1XbgwW6Mn27+p+h6IWxwuZSsu fQhl0TfJqObvRCtJ4e+FKThDfeNilrhWtbB4HxX77Dci870DRm4UeaRgZWbF/Cr3dpDR 3PUPrJY3oQfLkCUwHK6v+QH7ZTElVvkUTis8SEsMxKW5dzqfnG2UDpjldj4H5iF67PpI JLww==
X-Gm-Message-State: AOJu0YzD+btPngAqt7przNkort+D6sDEyFr3u/8E8JaouI8oCw4ltfmA nld0hP4wsGyiJrPr8mVmkSpiz3fa5PZuLTKlqweXl07fJXHl8WqOaqciArXXk1yFf43hodOnAaM b8Ljw5hgD83DEN092xYpL1VkfAiKh8h/NQ743jFusqTBgjTzIasDoLQ4=
X-Gm-Gg: AZuq6aIWlW5OwT3Ah8QBZEoJzE3Lu10dtCVZN2SPejkm7edToclLCTwlssro4Uw8DRv kbcsUpS66042hTDu82qg37mYaM26aZkGWdiU5Q3SmbXBPO6HDr+uAfrhzSmAjSyI460Y8hNJney VLupaF8LuhMGtE9wC8xEE4D1tWIHTzvN2HZoi8DZCRCXg+YQWIVOk8fN9M6FL8960tWGE0YUgMT ge/IujGdBBE+de9eo05QHpGwYRgs6R08n7CLlBcj35OQRuo8e2qDuM7p67o8jPwy2XSEPE3MfwF BnpCVBmkGtsFSjA12Oq1RQuzJny+pg==
X-Received: by 2002:a05:6102:a4c:b0:5ee:a3a4:98b2 with SMTP id ada2fe7eead31-5f1924548cbmr6609381137.8.1768920090124; Tue, 20 Jan 2026 06:41:30 -0800 (PST)
MIME-Version: 1.0
From: "Iona Thomas" (via ethesaurus_social_club Mailing List) <ethesaurus_social_club@framagroupes.org>
Date: Tue, 20 Jan 2026 15:41:18 +0100
X-Gm-Features: AZwV_QgNGLd5AxO3asijceAdWkP5JxstIe6K190LURiEAX7SVDVNdyWeCLUsVf4
Message-ID: <CAM46oAQFfhAp2OuWffHsQavrDE0=ty+8jEXoMcV-aoiw=AT=jg@mail.gmail.com>
To: ethesaurus_social_club@framagroupes.org
X-Spamd-Bar: /
X-Rspamd-Server: julio
X-Rspamd-Action: no action
X-Spamd-Result: default: False [-0.36 / 16.00]; R_MIXED_CHARSET(0.64)[]; DMARC_POLICY_ALLOW(-0.50)[holusion.com,none]; R_SPF_ALLOW(-0.20)[+ip6:2607:f8b0:4000::/36]; R_DKIM_ALLOW(-0.20)[holusion.com:s=google]; MIME_GOOD(-0.10)[multipart/related,multipart/alternative,text/plain]; RCPT_COUNT_ONE(0.00)[1]; TO_DN_NONE(0.00)[]; ASN(0.00)[asn:15169, ipnet:2607:f8b0::/32, country:US]; MIME_TRACE(0.00)[0:+,1:+,2:+,3:~,4:~,5:~,6:~,7:~,8:~,9:~]; RCVD_COUNT_ONE(0.00)[1]; FROM_HAS_DN(0.00)[]; NEURAL_HAM(-0.00)[-1.000]; MISSING_XM_UA(0.00)[]; TO_MATCH_ENVRCPT_ALL(0.00)[]; FROM_EQ_ENVFROM(0.00)[]; PREVIOUSLY_DELIVERED(0.00)[ethesaurus_social_club@framagroupes.org]; RCVD_TLS_LAST(0.00)[]; DKIM_TRACE(0.00)[holusion.com:+]
X-Rspamd-Queue-Id: 4dwVQ42GWzz26hLv
Subject: [ethesaurus_social_club] Nouvelles d'eCorpus - =?UTF-8?Q?=C3=89cl?= =?UTF-8?Q?airage?= et projets eCorpus / eCorpus News - Scene lighting and eCorpus project
Reply-To: ethesaurus_social_club@framagroupes.org
X-Loop: ethesaurus_social_club@framagroupes.org
X-Sequence: 146
Errors-To: ethesaurus_social_club-owner@framagroupes.org
Precedence: list
Precedence: bulk
Sender: ethesaurus_social_club-request@framagroupes.org
X-no-archive: yes
List-Id: <ethesaurus_social_club.framagroupes.org>
List-Help: <https://framagroupes.org/sympa/help>, <mailto:sympa@framagroupes.org?subject=HELP>
List-Subscribe: <https://framagroupes.org/sympa/subscribe/ethesaurus_social_club>, <mailto:sympa@framagroupes.org?subject=SUB%20ethesaurus_social_club>
List-Unsubscribe: <https://framagroupes.org/sympa/signoff/ethesaurus_social_club>, <mailto:sympa@framagroupes.org?subject=SIG%20ethesaurus_social_club>
List-Post: <mailto:ethesaurus_social_club@framagroupes.org>
List-Owner: <mailto:ethesaurus_social_club-request@framagroupes.org>
List-Archive: <https://framagroupes.org/sympa/arc/ethesaurus_social_club>
Archived-At: <https://framagroupes.org/sympa/msg/ethesaurus_social_club/2026-01/aWMnY0Y2Tqwr9XxnSR56kQ>
X-Original-DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=holusion.com; s=google; t=1768920091; x=1769524891; darn=framagroupes.org; h=to:subject:message-id:date:from:mime-version:from:to:cc:subject :date:message-id:reply-to; bh=F4uuJDfhv8SKgtkeckZg45Umqp9m0RjictlSleXo9PQ=; b=eARBVqtvdrmaJhTmMv6fMIeR/1T69hbA5gx6ALbwDSAK/RKw/SJaoSIzHlTv8DXVVa 8RN+oJ29Nb2xaHsWnmqtt1ASCO5HPsJQdt6M1aMSJ19oAr/Vi47SjVxcwm959zNM0IWl c50JcoOcsJ0bLphuhY+r1mY19/CZhRwZTuH+M=
X-Original-From: Iona Thomas <ithomas@holusion.com>
Content-type: multipart/mixed; boundary="----------=_1768920100-504556-135219"
X-Spam-Status: No, score=-100.20

------------=_1768920100-504556-135219
Content-Type: multipart/related; boundary="0000000000009bf32e0648d2cde1"

--0000000000009bf32e0648d2cde1
Content-Type: multipart/alternative; boundary="0000000000009bf32d0648d2cde0"

--0000000000009bf32d0648d2cde0
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

Nouvelles d'eCorpus - =C3=89clairage des sc=C3=A8nes et projets eCorpus
------------------------------

Looking for the english version ? Please scroll down.

Au menu de la premi=C3=A8re newsletter de 2026 :

   - Les nombreuses actions de formations et projets s=E2=80=99appuyant sur=
 eCorpus
   qui nous ont occup=C3=A9s depuis la derni=C3=A8re =C3=A9dition,
   - Un =C3=A9clairage personnalisable dans les sc=C3=A8nes voyager,
   - La documentation des droits d=E2=80=99utilisateurs,
   - Un coup d'=C5=93il dans les coulisses du d=C3=A9veloppement des nouvel=
les
   fonctionnalit=C3=A9s !

=C3=89v=C3=A8nements et projets eCorpus
------------------------------

eCorpus s=E2=80=99inscrit progressivement dans le cadre d=E2=80=99un centre=
 de comp=C3=A9tences
3D fond=C3=A9 par l=E2=80=99Universit=C3=A9 Lille et Holusion. Le lancement=
 officiel aura
lieu au premier trimestre 2026 et il aura pour ambition d=E2=80=99assurer l=
e
d=C3=A9veloppement d=E2=80=99eCorpus, de former =C3=A0 la photogramm=C3=A9t=
rie et d=E2=80=99accompagner
les institutions dans la num=C3=A9risation du patrimoine culturel et
scientifique.

On vous d=C3=A9taille quatres projets et =C3=A9v=C3=A8nements auquel nous a=
vons participer
en fin d'ann=C3=A9e 2025.
=E2=80=A2 Digital Heritage Forum, Abu Dhabi

Nous avons =C3=A9t=C3=A9 invit=C3=A9 =C3=A0 la premi=C3=A8re =C3=A9dition d=
u Digital Heritage Forum au
Emirats Arabes Unis, du 3 au 5 novembre 2025 pour animer une table ronde
sur les espaces num=C3=A9riques collaboratifs. Avec six intervenants venant=
s
d=E2=80=99Europe, d=E2=80=99Afrique et d=E2=80=99Asie, notre objectif =C3=
=A9tait de pr=C3=A9senter les enjeux
autour de la donn=C3=A9es 3D pour le patrimoine, surtout dans un contexte
international o=C3=B9 chercheurs, =C3=A9tats, institutions, populations loc=
ales et
ONG se rejoignent avec des objectifs parfois divergents.
[image: Digital Heritage Forum]
=E2=80=A2 Formation en photogramm=C3=A9trie au Fresnoy

En collaboration avec le CNRS et la F=C3=A9d=C3=A9ration de Recherche Scien=
ce et
Culture du Visuel, nous avons anim=C3=A9 une premi=C3=A8re formation =C3=A0=
 la
photogramm=C3=A9trie et l=E2=80=99utilisation d=E2=80=99eCorpus
<https://pepr-iccare.fr/events/formation-initiation-a-la-photogrammetrie/>.
Celle-ci s=E2=80=99est d=C3=A9roul=C3=A9e dans le cadre du PEPR ICCARE
<https://pepr-iccare.fr/>, un programme ambitieux de recherche et
collaboration entre les laboratoires et les Industries Culturelles et
Cr=C3=A9atives. A destination des chercheurs et des sp=C3=A9cialistes des
collections, cette formation a pu se d=C3=A9rouler en conditions r=C3=A9ell=
es gr=C3=A2ce =C3=A0
la participation du Mus=C3=A9e de la Piscine de Roubaix.

La formation a couvert la th=C3=A9orie de la photogramm=C3=A9trie, les logi=
ciels
libres ou gratuits pour la reconstruction 3D, les prises de vue en studio
et in situ dans les salles d=E2=80=99exposition. Enfin, les travaux de tous=
 les
participants ont pu =C3=AAtre d=C3=A9pos=C3=A9s sur une base eCorpus pour =
=C3=AAtre enrichis et
diffus=C3=A9s.

Cette formation sera =C3=A0 nouveau propos=C3=A9e en 2026.
[image: Sc=C3=A8ne eCorpus du Vieux travailleur]
<https://ecorpus.fr-scv.fr/ui/scenes/le%20faucheur/view> =E2=80=A2 Enseigne=
ment
secondaire et M=C3=A9tiers d=E2=80=99Arts

Dans la r=C3=A9gion Hauts-de-France, le projet Villa M=C3=A9dicis
<https://www.culture.gouv.fr/regions/drac-hauts-de-france/contacter-la-drac=
-hauts-de-france/les-lyceens-et-apprentis-des-hauts-de-france-en-route-vers=
-la-villa-medicis>
a =C3=A9t=C3=A9 lanc=C3=A9 le 13/11 au Louvre Lens en pr=C3=A9sence du Pr=
=C3=A9sident de la r=C3=A9gion,
Xavier Bertrand. 10 =C3=A9tablissements proposant des formations
professionnelles aux m=C3=A9tiers d=E2=80=99Arts vont r=C3=A9aliser des che=
fs-d'=C5=93uvre dans le
but de les pr=C3=A9senter lors d=E2=80=99une r=C3=A9sidence artistique =C3=
=A0 Rome, dans la
c=C3=A9l=C3=A8bre Villa M=C3=A9dicis, au printemps 2026.

Pour garder une trace num=C3=A9rique des =C5=93uvres, la r=C3=A9gion va uti=
liser le
logiciel eCorpus pour num=C3=A9riser, enrichir et diffuser en 3D les travau=
x
d'=C3=A9b=C3=A9nisterie, de taille de pierre ou encore de ferronnerie d=E2=
=80=99art des
jeunes talents.
=E2=80=A2 Journ=C3=A9es PEPR ICCARE

Le 16 d=C3=A9cembre au Mus=C3=A9e de l=E2=80=99Hospice Comtesse =C3=A0 Lill=
e a eu lieu une journ=C3=A9e
d'acc=C3=A9l=C3=A9ration autour des technologies immersives
<https://pepr-iccare.fr/events/revoir-et-revivre-pour-transmettre-les-techn=
ologies-immersives-au-service-du-patrimoine-et-des-musees/>
au service des Patrimoine et des Mus=C3=A9es. Studio de num=C3=A9risation 3=
D
automatique, reproduction 3D, hologrammes, dispositifs de m=C3=A9diation : =
notre
objectif =C3=A9tait de d=C3=A9montrer toutes les facettes qu=E2=80=99offre =
la num=C3=A9risation 3D
et l=E2=80=99importance de sa documentation et sa p=C3=A9rennisation.

Une application de pr=C3=A9sentation des globes de Coronelli utilisant eCor=
pus a
=C3=A9t=C3=A9 d=C3=A9voil=C3=A9e =C3=A0 l=E2=80=99occasion. Son installatio=
n dans les salles du mus=C3=A9e est
pr=C3=A9vue dans le courant de l=E2=80=99ann=C3=A9e pour permettre de voir =
les deux globes,
un de la vo=C3=BBte c=C3=A9leste, un de la Terre, dans les moindres d=C3=A9=
tails.
[image: Vue de l'application pour les globes de Coronelli]
D=C3=A9couvrez vos objets sous une nouvelle lumi=C3=A8re
------------------------------

Lors des derni=C3=A8res versions de Voyager, la gestion des lumi=C3=A8res a=
 =C3=A9t=C3=A9
am=C3=A9lior=C3=A9e. Celles-ci sont d=C3=A9sormais =C3=A9ditables dans Voya=
ger et la lumi=C3=A8re
d'environnement (HDRi) est d=C3=A9sormais l=E2=80=99=C3=A9clairage par d=C3=
=A9faut des nouvelles
sc=C3=A8nes.

Un nouveau tutoriel est d=C3=A9sormais disponible pour vous pr=C3=A9senter =
les
possibilit=C3=A9s de l=E2=80=99=C3=A9clairage par d=C3=A9faut, et vous acco=
mpagner dans la
cr=C3=A9ation d=E2=80=99 =C3=A9clairage personnalis=C3=A9s :
Guide =C3=A9clairage <https://ecorpus.eu/fr/doc/tutorials/lights.html>
Les droits sur eCorpus
------------------------------

La page de documentation sur la gestion des utilisateurs contient d=C3=A9so=
rmais
un tableau r=C3=A9capitulatif des droits en fonction de leur r=C3=B4le sur =
le serveur
eCorpus.
Gestion des utilisateurs
<https://ecorpus.eu/fr/doc/advancedUses/userAdministration.html>
Autres nouvelles et perspectives
------------------------------

La langue arabe a =C3=A9t=C3=A9 ajout=C3=A9e =C3=A0 Voyager par le Smithson=
ian. Nous avons
travaill=C3=A9 =C3=A0 l=E2=80=99 extension de l=E2=80=99API de voyager. Ces=
 nouvelles fonctionnalit=C3=A9s
ouvrent de nouvelles possibilit=C3=A9s pour produire des outils de m=C3=A9d=
iations
comme ceux qui ont =C3=A9t=C3=A9 pr=C3=A9sent=C3=A9s dans le cadre de la jo=
urn=C3=A9e PEPR Icare.

Dans les coulisses nous travaillons sur l=E2=80=99automatisation du retrait=
ement
des mod=C3=A8les lors de leur import dans eCorpus.

S'inscrire <https://framagroupes.org/sympa/subscribe/ethesaurus_social_club=
>
- Se d=C3=A9sabonner
<https://framagroupes.org/sympa/signoff/ethesaurus_social_club>
eCorpus News =E2=80=93 Scene lighting and eCorpus projects
------------------------------

Here is a look at what=E2=80=99s on the menu for our first newsletter of 20=
26:

   - The training sessions and projects built around eCorpus that have kept
   us busy since the last issue,
   - Customizable lighting in Voyager scenes,
   - Updated documentation on user permissions,
   - A behind-the-scenes look at the development of new features!

eCorpus events and projects
------------------------------

eCorpus developpement and promotion is gradually becoming part of the
mission of a 3D Competence Center founded by University of Lille and
Holusion. The official launch is planned for the first quarter of 2026,
with the goal of supporting eCorpus development, providing training in
photogrammetry, and helping institutions digitize cultural and scientific
heritage.

Here=E2=80=99s a closer look at four projects and events we took part in at=
 the end
of 2025.
=E2=80=A2 Digital Heritage Forum, Abu Dhabi

We were invited to the very first Digital Heritage Forum in the United Arab
Emirates, held November 3=E2=80=935, 2025, to host a roundtable on collabor=
ative
digital spaces. With six speakers from Europe, Africa, and Asia, our goal
was to highlight the key challenges around 3D data for heritage=E2=80=94esp=
ecially
in an international context where researchers, governments, institutions,
local communities, and NGOs often come together with sometimes diverging
goals.
[image: Digital Heritage Forum]
=E2=80=A2 Photogrammetry training at Le Fresnoy

In collaboration with CNRS and the Science and Visual Culture Research
Federation, we led our first training session on photogrammetry and using
eCorpus
<https://pepr-iccare.fr/events/formation-initiation-a-la-photogrammetrie/>.
The workshop took place as part of PEPR ICCARE <https://pepr-iccare.fr/>,
an ambitious research program bringing together academic labs and the
Cultural and Creative Industries. Designed for researchers and collection
specialists, the training was held under real-world conditions thanks to
the participation of the museum La Piscine in Roubaix.

The program covered photogrammetry theory, free and open-source software
for 3D reconstruction, studio photography, and on-site capture in
exhibition galleries. All participants were then able to upload their work
to an eCorpus database to enrich and share it.

A second training session will take place in 2026.
[image: eCorpus scene of The Old Worker]
<https://ecorpus.fr-scv.fr/ui/scenes/le%20faucheur/view> =E2=80=A2 Secondar=
y
education and fine crafts

In the Hauts-de-France region, the Villa M=C3=A9dicis project
<https://www.culture.gouv.fr/regions/drac-hauts-de-france/contacter-la-drac=
-hauts-de-france/les-lyceens-et-apprentis-des-hauts-de-france-en-route-vers=
-la-villa-medicis>
was launched on November 13 at the Louvre-Lens museum, in the presence of
Xavier Bertrand, the President of the region. Ten schools offering
vocational training in fine crafts will create masterworks to be showcased
during an artistic residency at the iconic Villa M=C3=A9dicis in Rome in sp=
ring
2026.

To preserve a digital record of these works, the region will use eCorpus to
digitize, enrich, and share 3D models of woodworking, stone carving,
ornamental ironwork, and other creations by these young talents.
=E2=80=A2 PEPR ICCARE Day

On December 16, the Mus=C3=A9e de l=E2=80=99Hospice Comtesse in Lille hoste=
d an acceleration
day focused on immersive technologies
<https://pepr-iccare.fr/events/revoir-et-revivre-pour-transmettre-les-techn=
ologies-immersives-au-service-du-patrimoine-et-des-musees/>
for heritage and museums. Automated 3D scanning studios, 3D reproduction,
holograms, mediation tools=E2=80=94our aim was to showcase the many facets =
of 3D
digitization and highlight the importance of proper documentation and
long-term preservation.

A mediation application for the Coronelli globes, developped using eCorpus,
was unveiled at the event. Its installation in the museum galleries is
planned for later this year, allowing visitors to explore both the
celestial and the terrestrial in detail.
[image: View of the Coronelli Globes application]
See your objects in a whole new light
------------------------------

In recent versions of Voyager, lighting management has been improved.
Lights can now be edited directly in Voyager, and environment lighting
(HDRi) is now the default setup for new scenes.

A new tutorial is now available to walk you through the default lighting
options and help you create custom lighting setups:
Lighting guide <https://ecorpus.eu/en/doc/tutorials/lights.html>
User permissions in eCorpus
------------------------------

The user management documentation page now includes a summary table
outlining permissions based on each user=E2=80=99s role on an eCorpus serve=
r.
User management
<https://ecorpus.eu/en/doc/advancedUses/userAdministration.html>
More news and what=E2=80=99s next
------------------------------

Arabic has been added to Voyager by the Smithsonian. At the same time,
we=E2=80=99ve been working on extending Voyager=E2=80=99s API. These new fe=
atures open up
exciting possibilities for creating mediation tools like those presented
during the PEPR ICCARE Day.

Behind the scenes, we=E2=80=99re also working on automating 3D model proces=
sing
during import into eCorpus.

Subscribe <https://framagroupes.org/sympa/subscribe/ethesaurus_social_club>
=E2=80=93 Unsubscribe
<https://framagroupes.org/sympa/signoff/ethesaurus_social_club>

--0000000000009bf32d0648d2cde0
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

<div dir=3D"ltr">
  <div style=3D"background-color:rgb(245,245,245);color:rgb(38,38,38);font-=
family:&quot;Noto Serif&quot;,&quot;Helvetica Neue&quot;,&quot;Arial Nova&q=
uot;,&quot;Nimbus Sans&quot;,Arial,sans-serif;font-size:16px;font-weight:40=
0;letter-spacing:0.15008px;line-height:1.5;margin:0px;padding:32px 0px;min-=
height:100%;width:100%">
    <table align=3D"center" width=3D"100%" style=3D"margin:0px auto;max-wid=
th:600px;background-color:rgb(255,255,255)" role=3D"presentation" cellspaci=
ng=3D"0" cellpadding=3D"0" border=3D"0">
      <tbody>
        <tr style=3D"width:100%">
          <td style=3D"font-weight:normal;padding:8px 24px">
            <h1 style=3D"font-weight:bold;margin:0px;font-family:&quot;Noto=
 Serif&quot;,Charter,&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,C=
ambria,serif;font-size:32px;padding:16px 0px">
              Nouvelles d&#39;eCorpus - =C3=89clairage des sc=C3=A8nes et p=
rojets eCorpus
            </h1>
            <div>
              <hr style=3D"border-width:4px medium medium;border-style:soli=
d none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0p=
x;padding:0px 0px 16px">
            </div>
            <p style=3D"font-style:italic"> <span style=3D"border-bottom:1p=
x solid rgb(230,185,0)">Looking for the english
                version ? Please scroll down.</span>
            </p>

            <p>Au menu de la premi=C3=A8re newsletter de 2026 :
            </p><ul><li>Les nombreuses actions de formations et projets s=
=E2=80=99appuyant sur eCorpus qui
                nous ont occup=C3=A9s depuis la
                derni=C3=A8re =C3=A9dition,</li><li>Un =C3=A9clairage perso=
nnalisable dans les sc=C3=A8nes voyager,</li><li>La documentation des droit=
s d=E2=80=99utilisateurs,</li><li>Un coup d&#39;=C5=93il dans les coulisses=
 du d=C3=A9veloppement des nouvelles
                fonctionnalit=C3=A9s !</li></ul>
            <h2 id=3D"gmail-h2actions" name=3D"h2actions" style=3D"font-wei=
ght:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quot;Bitstr=
eam Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:24px;paddi=
ng:16px 0px">
              =C3=89v=C3=A8nements et projets eCorpus</h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">
            <p>
              eCorpus s=E2=80=99inscrit progressivement dans le cadre d=E2=
=80=99un centre de comp=C3=A9tences 3D fond=C3=A9 par l=E2=80=99Universit=
=C3=A9 Lille
              et Holusion. Le lancement officiel aura lieu au premier trime=
stre 2026 et il aura pour ambition d=E2=80=99assurer
              le d=C3=A9veloppement d=E2=80=99eCorpus, de former =C3=A0 la =
photogramm=C3=A9trie et d=E2=80=99accompagner les institutions dans la
              num=C3=A9risation du patrimoine culturel et scientifique.
            </p>
            <p>
              On vous d=C3=A9taille quatres projets et =C3=A9v=C3=A8nements=
 auquel nous avons participer en fin d&#39;ann=C3=A9e 2025.
            </p>


            <h3 style=3D"font-weight:bold;margin:0px;font-family:&quot;Noto=
 Serif&quot;,Charter,&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,C=
ambria,serif;font-size:20px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> Digital Heritage Forum, Abu Dhabi
            </h3>
            <p>Nous avons =C3=A9t=C3=A9 invit=C3=A9 =C3=A0 la premi=C3=A8re=
 =C3=A9dition du Digital Heritage Forum au Emirats Arabes Unis, du 3 au 5
              novembre 2025 pour animer une table ronde sur les espaces num=
=C3=A9riques collaboratifs. Avec six intervenants
              venants d=E2=80=99Europe, d=E2=80=99Afrique et d=E2=80=99Asie=
, notre objectif =C3=A9tait de pr=C3=A9senter les enjeux autour de la donn=
=C3=A9es
              3D pour le patrimoine, surtout dans un contexte international=
 o=C3=B9 chercheurs, =C3=A9tats, institutions,
              populations locales et ONG se rejoignent avec des objectifs p=
arfois divergents.
            </p>
            <div style=3D"display:flex">
              <img src=3D"cid:ii_mkmp8ac30" alt=3D"Digital Heritage Forum" =
width=3D"500" height=3D"333">
            </div>

            <h3 style=3D"font-weight:bold;margin:0px;font-family:&quot;Noto=
 Serif&quot;,Charter,&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,C=
ambria,serif;font-size:20px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> Formation en photogramm=C3=A9trie au
              Fresnoy

            </h3>
            <p>
              En collaboration avec le CNRS et la F=C3=A9d=C3=A9ration de R=
echerche Science et Culture du Visuel, nous avons anim=C3=A9
              une premi=C3=A8re <a href=3D"https://pepr-iccare.fr/events/fo=
rmation-initiation-a-la-photogrammetrie/">formation
                =C3=A0 la
                photogramm=C3=A9trie et l=E2=80=99utilisation d=E2=80=99eCo=
rpus</a>. Celle-ci s=E2=80=99est d=C3=A9roul=C3=A9e dans le
              cadre du <a href=3D"https://pepr-iccare.fr/">PEPR ICCARE</a>,=
 un programme ambitieux de recherche et
              collaboration entre les laboratoires et les
              Industries Culturelles et Cr=C3=A9atives.
              A destination des chercheurs et des sp=C3=A9cialistes des col=
lections, cette formation a pu se d=C3=A9rouler en
              conditions r=C3=A9elles gr=C3=A2ce =C3=A0 la participation du=
 Mus=C3=A9e de la Piscine de Roubaix.</p>
            <p>
              La formation a couvert la th=C3=A9orie de la photogramm=C3=A9=
trie, les logiciels libres ou gratuits pour la
              reconstruction 3D, les prises de vue en studio et in situ dan=
s les salles d=E2=80=99exposition.
              Enfin, les travaux de tous les participants ont pu =C3=AAtre =
d=C3=A9pos=C3=A9s sur une base eCorpus pour =C3=AAtre enrichis et
              diffus=C3=A9s.</p>
            <p> Cette formation sera =C3=A0 nouveau propos=C3=A9e en 2026.
            </p>
            <a href=3D"https://ecorpus.fr-scv.fr/ui/scenes/le%20faucheur/vi=
ew" style=3D"display:flex">
              <img src=3D"cid:ii_mkmp8ac61" alt=3D"Sc=C3=A8ne eCorpus du Vi=
eux travailleur" width=3D"500" height=3D"306">
            </a>



            <h3 style=3D"font-weight:bold;margin:0px;font-family:&quot;Noto=
 Serif&quot;,Charter,&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,C=
ambria,serif;font-size:20px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> Enseignement secondaire et
              M=C3=A9tiers d=E2=80=99Arts
            </h3>
            <p>Dans la r=C3=A9gion Hauts-de-France, le <a href=3D"https://w=
ww.culture.gouv.fr/regions/drac-hauts-de-france/contacter-la-drac-hauts-de-=
france/les-lyceens-et-apprentis-des-hauts-de-france-en-route-vers-la-villa-=
medicis">projet Villa M=C3=A9dicis</a> a =C3=A9t=C3=A9 lanc=C3=A9 le 13/11 =
au Louvre Lens en
              pr=C3=A9sence du Pr=C3=A9sident de la r=C3=A9gion, Xavier Ber=
trand. 10 =C3=A9tablissements proposant des formations
              professionnelles aux m=C3=A9tiers d=E2=80=99Arts vont r=C3=A9=
aliser des chefs-d&#39;=C5=93uvre dans le but de les pr=C3=A9senter lors
              d=E2=80=99une r=C3=A9sidence artistique =C3=A0 Rome, dans la =
c=C3=A9l=C3=A8bre Villa M=C3=A9dicis, au printemps 2026.
            </p>
            <p>Pour garder une trace num=C3=A9rique des =C5=93uvres, la r=
=C3=A9gion va utiliser le logiciel eCorpus pour num=C3=A9riser,
              enrichir et diffuser en 3D les travaux d&#39;=C3=A9b=C3=A9nis=
terie, de taille de pierre ou encore de ferronnerie d=E2=80=99art
              des jeunes talents.</p>

            <h3 id=3D"gmail-h3journeePEPR" name=3D"h3journeePEPR" style=3D"=
font-weight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quo=
t;Bitstream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:20=
px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> Journ=C3=A9es PEPR ICCARE
            </h3>
            <p>Le 16 d=C3=A9cembre au Mus=C3=A9e de l=E2=80=99Hospice Comte=
sse =C3=A0 Lille a eu lieu une <a href=3D"https://pepr-iccare.fr/events/rev=
oir-et-revivre-pour-transmettre-les-technologies-immersives-au-service-du-p=
atrimoine-et-des-musees/">journ=C3=A9e d&#39;acc=C3=A9l=C3=A9ration autour =
des
                technologies immersives</a> au service des Patrimoine et de=
s Mus=C3=A9es.
              Studio de num=C3=A9risation 3D automatique, reproduction 3D, =
hologrammes, dispositifs de m=C3=A9diation : notre
              objectif =C3=A9tait de d=C3=A9montrer toutes les facettes qu=
=E2=80=99offre la num=C3=A9risation 3D et l=E2=80=99importance de sa
              documentation et sa p=C3=A9rennisation.</p>
            <p>Une application de pr=C3=A9sentation des globes de Coronelli=
 utilisant eCorpus a =C3=A9t=C3=A9 d=C3=A9voil=C3=A9e =C3=A0 l=E2=80=99occa=
sion.
              Son installation dans les salles du mus=C3=A9e est pr=C3=A9vu=
e dans le courant de l=E2=80=99ann=C3=A9e pour permettre de voir les
              deux globes, un de la vo=C3=BBte c=C3=A9leste, un de la Terre=
, dans les moindres d=C3=A9tails. </p>

            <div style=3D"display:flex">
              <img src=3D"cid:ii_mkmp8ac92" alt=3D"Vue de l&#39;application=
 pour les globes de Coronelli" width=3D"500" height=3D"375">
            </div>

            <h2 id=3D"gmail-h2lumiere" name=3D"h2lumiere" style=3D"font-wei=
ght:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quot;Bitstr=
eam Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:24px;paddi=
ng:16px 0px">
              D=C3=A9couvrez vos objets sous une nouvelle lumi=C3=A8re</h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">

            <p>Lors des derni=C3=A8res versions de Voyager, la <span style=
=3D"font-weight:bold">gestion des lumi=C3=A8res</span> a
              =C3=A9t=C3=A9 am=C3=A9lior=C3=A9e. Celles-ci sont d=C3=A9sorm=
ais
              =C3=A9ditables dans Voyager et la lumi=C3=A8re d&#39;environn=
ement (HDRi) est d=C3=A9sormais l=E2=80=99=C3=A9clairage par d=C3=A9faut de=
s
              nouvelles sc=C3=A8nes.</p>

            <p>Un nouveau tutoriel est d=C3=A9sormais disponible pour vous =
pr=C3=A9senter les possibilit=C3=A9s de l=E2=80=99=C3=A9clairage par
              d=C3=A9faut,
              et vous accompagner dans la cr=C3=A9ation d=E2=80=99 <span st=
yle=3D"font-weight:bold">=C3=A9clairage personnalis=C3=A9s</span> :
            </p>


            <div style=3D"text-align:center;margin-bottom:1em">
              <a style=3D"padding:0.5rem 1rem;background-color:rgb(230,185,=
0);border-width:0px;color:rgb(255,255,255);text-decoration:none;font-weight=
:500" href=3D"https://ecorpus.eu/fr/doc/tutorials/lights.html">
                Guide =C3=A9clairage
              </a>
            </div>

            <h2 id=3D"gmail-h2droits" name=3D"h2droits" style=3D"font-weigh=
t:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quot;Bitstrea=
m Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:24px;padding=
:16px 0px">
              Les droits sur eCorpus</h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">

            <p>La page de documentation sur la gestion des utilisateurs con=
tient d=C3=A9sormais un tableau r=C3=A9capitulatif des
              droits en fonction de leur r=C3=B4le sur le serveur eCorpus. =
</p>

            <div style=3D"text-align:center;margin-bottom:1em">
              <a style=3D"padding:0.5rem 1rem;background-color:rgb(230,185,=
0);border-width:0px;color:rgb(255,255,255);text-decoration:none;font-weight=
:500" href=3D"https://ecorpus.eu/fr/doc/advancedUses/userAdministration.htm=
l">
                Gestion des utilisateurs
              </a>
            </div>

            <h2 id=3D"gmail-h2perspective" name=3D"h2perspective" style=3D"=
font-weight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quo=
t;Bitstream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:24=
px;padding:16px 0px">
              Autres nouvelles et perspectives </h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">
            <p>
            </p><p>La langue <span style=3D"font-weight:bold">arabe</span> =
a =C3=A9t=C3=A9 ajout=C3=A9e =C3=A0 Voyager par le Smithsonian. Nous
              avons travaill=C3=A9 =C3=A0 l=E2=80=99 <span style=3D"font-we=
ight:bold">extension de l=E2=80=99API</span> de
              voyager. Ces nouvelles fonctionnalit=C3=A9s ouvrent de nouvel=
les possibilit=C3=A9s pour produire des outils de
              m=C3=A9diations comme ceux qui ont =C3=A9t=C3=A9 pr=C3=A9sent=
=C3=A9s dans le cadre de la journ=C3=A9e PEPR
              Icare.
            </p>

            <p>
              Dans les coulisses nous travaillons sur l=E2=80=99automatisat=
ion du retraitement des mod=C3=A8les lors de leur
              import dans eCorpus.
            </p>

            <p>
              <a href=3D"https://framagroupes.org/sympa/subscribe/ethesauru=
s_social_club">S&#39;inscrire</a> - <a href=3D"https://framagroupes.org/sym=
pa/signoff/ethesaurus_social_club">Se d=C3=A9sabonner</a>
            </p>
          </td>
        </tr>
      </tbody>
    </table>

    <table align=3D"center" width=3D"100%" style=3D"margin:2em auto 0px;max=
-width:600px;background-color:rgb(255,255,255)" role=3D"presentation" cells=
pacing=3D"0" cellpadding=3D"0" border=3D"0">
      <tbody>
        <tr style=3D"width:100%">
          <td style=3D"font-weight:normal;padding:8px 24px">


            <h1 id=3D"englishVersion" name=3D"englishVersion" style=3D"font=
-weight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quot;Bi=
tstream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:32px;p=
adding:16px 0px">
              eCorpus News =E2=80=93 Scene lighting and eCorpus projects
            </h1>
            <div>
              <hr style=3D"border-width:4px medium medium;border-style:soli=
d none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0p=
x;padding:0px 0px 16px">
            </div>

            <p>Here is a look at what=E2=80=99s on the menu for our first n=
ewsletter of 2026:</p>
            <ul><li>The training sessions and projects built around eCorpus=
 that have kept
                us busy
                since the last issue,</li><li>Customizable lighting in Voya=
ger scenes,</li><li>Updated documentation on user permissions,</li><li>A be=
hind-the-scenes look at the development of new features!</li></ul>

            <h2 id=3D"gmail-h2actionsEN" name=3D"h2actionsEN" style=3D"font=
-weight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quot;Bi=
tstream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:24px;p=
adding:16px 0px">
              eCorpus events and projects
            </h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">

            <p>
              eCorpus developpement and promotion is gradually becoming par=
t of the mission of a 3D Competence Center
              founded by University of Lille and
              Holusion.
              The
              official launch is planned for the first quarter of 2026, wit=
h the goal of supporting eCorpus development,
              providing training in photogrammetry, and helping institution=
s digitize cultural and scientific heritage.
            </p>

            <p>
              Here=E2=80=99s a closer look at four projects and events we t=
ook part in at the end of 2025.
            </p>

            <h3 style=3D"font-weight:bold;margin:0px;font-family:&quot;Noto=
 Serif&quot;,Charter,&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,C=
ambria,serif;font-size:20px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> Digital Heritage Forum, Abu Dhabi
            </h3>
            <p>
              We were invited to the very first Digital Heritage Forum in t=
he United Arab Emirates, held November 3=E2=80=935,
              2025, to
              host a roundtable on collaborative digital spaces. With six s=
peakers from Europe, Africa, and Asia, our
              goal was to
              highlight the key challenges around 3D data for heritage=E2=
=80=94especially in an international context where
              researchers,
              governments, institutions, local communities, and NGOs often =
come together with sometimes diverging goals.
            </p>

            <div style=3D"display:flex">
              <img src=3D"cid:ii_mkmp8acc3" alt=3D"Digital Heritage Forum" =
width=3D"500" height=3D"333">
            </div>

            <h3 style=3D"font-weight:bold;margin:0px;font-family:&quot;Noto=
 Serif&quot;,Charter,&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,C=
ambria,serif;font-size:20px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> Photogrammetry training at Le Fresnoy
            </h3>
            <p>
              In collaboration with CNRS and the Science and Visual Culture=
 Research Federation, we led our first
              <a href=3D"https://pepr-iccare.fr/events/formation-initiation=
-a-la-photogrammetrie/">training session on
                photogrammetry
                and using eCorpus</a>. The workshop took place as part of <=
a href=3D"https://pepr-iccare.fr/">PEPR
                ICCARE</a>, an
              ambitious research program bringing together academic labs an=
d the Cultural and Creative Industries.
              Designed for researchers and collection specialists, the trai=
ning was held under real-world conditions
              thanks to
              the participation of the museum La Piscine in Roubaix.
            </p>
            <p>
              The program covered photogrammetry theory, free and open-sour=
ce software for 3D reconstruction, studio
              photography,
              and on-site capture in exhibition galleries. All participants=
 were then able to upload their work to an
              eCorpus
              database to enrich and share it.
            </p>
            <p>
              A second training session will take place in 2026.
            </p>

            <a href=3D"https://ecorpus.fr-scv.fr/ui/scenes/le%20faucheur/vi=
ew" style=3D"display:flex">
              <img src=3D"cid:ii_mkmp8acd4" alt=3D"eCorpus scene of The Old=
 Worker" width=3D"500" height=3D"306">
            </a>

            <h3 style=3D"font-weight:bold;margin:0px;font-family:&quot;Noto=
 Serif&quot;,Charter,&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,C=
ambria,serif;font-size:20px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> Secondary education and fine crafts
            </h3>
            <p>
              In the Hauts-de-France region, the <a href=3D"https://www.cul=
ture.gouv.fr/regions/drac-hauts-de-france/contacter-la-drac-hauts-de-france=
/les-lyceens-et-apprentis-des-hauts-de-france-en-route-vers-la-villa-medici=
s">
                Villa M=C3=A9dicis project</a> was launched on November 13 =
at the Louvre-Lens museum, in the presence of
              Xavier Bertrand, the
              President of the region. Ten schools offering vocational trai=
ning in fine crafts will create
              masterworks to be
              showcased during an artistic residency at the iconic Villa M=
=C3=A9dicis in Rome in spring 2026.
            </p>
            <p>
              To preserve a digital record of these works, the region will =
use eCorpus to digitize, enrich, and share 3D
              models of
              woodworking, stone carving, ornamental ironwork, and other cr=
eations by these young talents.
            </p>

            <h3 id=3D"gmail-h3journeePEPREN" name=3D"h3journeePEPREN" style=
=3D"font-weight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,=
&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-siz=
e:20px;padding:4px 0px 0px">
              <span style=3D"font-weight:bolder;color:rgb(230,185,0)">=E2=
=80=A2</span> PEPR ICCARE Day
            </h3>
            <p>
              On December 16, the Mus=C3=A9e de l=E2=80=99Hospice Comtesse =
in Lille hosted an
              <a href=3D"https://pepr-iccare.fr/events/revoir-et-revivre-po=
ur-transmettre-les-technologies-immersives-au-service-du-patrimoine-et-des-=
musees/">
                acceleration day focused on immersive technologies</a> for =
heritage and museums. Automated 3D scanning
              studios,
              3D reproduction, holograms, mediation tools=E2=80=94our aim w=
as to showcase the many facets of 3D digitization and
              highlight
              the importance of proper documentation and long-term preserva=
tion.
            </p>
            <p>
              A mediation application for the Coronelli globes, developped =
using eCorpus, was unveiled at the event. Its
              installation in the
              museum galleries is planned for later this year, allowing vis=
itors to explore both the celestial and the
              terrestrial in detail.
            </p>

            <div style=3D"display:flex">
              <img src=3D"cid:ii_mkmp8acg5" alt=3D"View of the Coronelli Gl=
obes application" width=3D"500" height=3D"375">
            </div>

            <h2 id=3D"gmail-h2lumiereEN" name=3D"h2lumiereEN" style=3D"font=
-weight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quot;Bi=
tstream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:24px;p=
adding:16px 0px">
              See your objects in a whole new light
            </h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">

            <p>
              In recent versions of Voyager, <span style=3D"font-weight:bol=
d">lighting management</span> has been
              improved. Lights can now be edited directly in Voyager, and e=
nvironment lighting (HDRi) is now the default
              setup for
              new scenes.
            </p>

            <p>
              A new tutorial is now available to walk you through the defau=
lt lighting options and help you create
              <span style=3D"font-weight:bold">custom lighting setups</span=
>:
            </p>

            <div style=3D"text-align:center;margin-bottom:1em">
              <a style=3D"padding:0.5rem 1rem;background-color:rgb(230,185,=
0);border-width:0px;color:rgb(255,255,255);text-decoration:none;font-weight=
:500" href=3D"https://ecorpus.eu/en/doc/tutorials/lights.html">
                Lighting guide
              </a>
            </div>

            <h2 id=3D"gmail-h2droitsEN" name=3D"h2droitsEN" style=3D"font-w=
eight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,&quot;Bits=
tream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-size:24px;pad=
ding:16px 0px">
              User permissions in eCorpus
            </h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">

            <p>
              The user management documentation page now includes a summary=
 table outlining permissions based on each
              user=E2=80=99s role
              on an eCorpus server.
            </p>

            <div style=3D"text-align:center;margin-bottom:1em">
              <a style=3D"padding:0.5rem 1rem;background-color:rgb(230,185,=
0);border-width:0px;color:rgb(255,255,255);text-decoration:none;font-weight=
:500" href=3D"https://ecorpus.eu/en/doc/advancedUses/userAdministration.htm=
l">
                User management
              </a>
            </div>

            <h2 id=3D"gmail-h2perspectiveEN" name=3D"h2perspectiveEN" style=
=3D"font-weight:bold;margin:0px;font-family:&quot;Noto Serif&quot;,Charter,=
&quot;Bitstream Charter&quot;,&quot;Sitka Text&quot;,Cambria,serif;font-siz=
e:24px;padding:16px 0px">
              More news and what=E2=80=99s next
            </h2>
            <hr style=3D"border-width:1px medium medium;border-style:solid =
none none;border-color:rgb(230,185,0) currentcolor currentcolor;margin:0px;=
padding:0px 24px 16px 0px">

            <p>
              <span style=3D"font-weight:bold">Arabic</span> has been added=
 to Voyager by the Smithsonian. At the same
              time, we=E2=80=99ve
              been working on <span style=3D"font-weight:bold">extending Vo=
yager=E2=80=99s API</span>. These new features open
              up exciting
              possibilities for creating mediation tools like those present=
ed during the PEPR
              ICCARE
              Day.
            </p>

            <p>
              Behind the scenes, we=E2=80=99re also working on automating 3=
D model processing during import into eCorpus.
            </p>

            <p>
              <a href=3D"https://framagroupes.org/sympa/subscribe/ethesauru=
s_social_club">Subscribe</a> =E2=80=93
              <a href=3D"https://framagroupes.org/sympa/signoff/ethesaurus_=
social_club">Unsubscribe</a>
            </p>


          </td>
        </tr>
      </tbody>
    </table>
  </div>


<br></div>

--0000000000009bf32d0648d2cde0--
--0000000000009bf32e0648d2cde1
Content-Type: image/jpeg; name="image.jpeg"
Content-Disposition: inline; filename="image.jpeg"
Content-Transfer-Encoding: base64
Content-ID: <ii_mkmp8ac61>
X-Attachment-Id: ii_mkmp8ac61


--0000000000009bf32e0648d2cde1
Content-Type: image/jpeg; name="image.jpeg"
Content-Disposition: inline; filename="image.jpeg"
Content-Transfer-Encoding: base64
Content-ID: <ii_mkmp8ac30>
X-Attachment-Id: ii_mkmp8ac30


--0000000000009bf32e0648d2cde1
Content-Type: image/jpeg; name="image.jpeg"
Content-Disposition: inline; filename="image.jpeg"
Content-Transfer-Encoding: base64
Content-ID: <ii_mkmp8ac92>
X-Attachment-Id: ii_mkmp8ac92


--0000000000009bf32e0648d2cde1
Content-Type: image/jpeg; name="image.jpeg"
Content-Disposition: inline; filename="image.jpeg"
Content-Transfer-Encoding: base64
Content-ID: <ii_mkmp8acc3>
X-Attachment-Id: ii_mkmp8acc3


--0000000000009bf32e0648d2cde1
Content-Type: image/jpeg; name="image.jpeg"
Content-Disposition: inline; filename="image.jpeg"
Content-Transfer-Encoding: base64
Content-ID: <ii_mkmp8acd4>
X-Attachment-Id: ii_mkmp8acd4


--0000000000009bf32e0648d2cde1
Content-Type: image/jpeg; name="image.jpeg"
Content-Disposition: inline; filename="image.jpeg"
Content-Transfer-Encoding: base64
Content-ID: <ii_mkmp8acg5>
X-Attachment-Id: ii_mkmp8acg5


--0000000000009bf32e0648d2cde1--
------------=_1768920100-504556-135219

-- 
Framagroupes est finance grace aux dons : soutenez l'association Framasoft sur https://soutenir.framasoft.org

Vous recevez cet email car vous suivez la liste "ethesaurus_social_club". Vous ne voulez plus recevoir ces emails ? Rendez-vous sur le lien https://framagroupes.org/sympa/sigrequest/ethesaurus_social_club ou contactez l'adresse sympa@framagroupes.org avec comme sujet "unsubscribe ethesaurus_social_club".

You receive this email since you subscribed to the list "ethesaurus_social_club". To unsubscribe, please go to the link https://framagroupes.org/sympa/sigrequest/ethesaurus_social_club or send an email to sympa@framagroupes.org with the subject "unsubscribe ethesaurus_social_club".

------------=_1768920100-504556-135219--